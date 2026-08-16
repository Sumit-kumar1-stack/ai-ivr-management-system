import fs from "fs/promises";
import path from "path";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  chunkText,
} from "@/services/knowledge/chunker";

import {
  indexDocuments,
} from "@/services/knowledge/indexer.service";

import {
  extractText,
} from "@/services/knowledge/parser";

import {
  saveKnowledgeDocument,
} from "@/services/knowledge.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "knowledge-upload-route"
  );

//--------------------------------------------------
// Constants
//--------------------------------------------------

const MAX_FILE_SIZE_BYTES =
  10 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);

//--------------------------------------------------
// Upload Knowledge Document
//--------------------------------------------------

export async function POST(
  request: NextRequest
) {
  const startedAt =
    process.hrtime.bigint();

  let savedFilePath:
    string |
    null =
      null;

  try {
    const formData =
      await request.formData();

    const uploadedValue =
      formData.get(
        "file"
      );

    if (
      !(uploadedValue instanceof File)
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "No file uploaded",
        },
        {
          status:
            400,
        }
      );
    }

    const file =
      uploadedValue;

    if (
      file.size <=
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Uploaded file is empty",
        },
        {
          status:
            400,
        }
      );
    }

    if (
      file.size >
      MAX_FILE_SIZE_BYTES
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "File exceeds the maximum allowed size",
        },
        {
          status:
            413,
        }
      );
    }

    if (
      file.type &&
      !ALLOWED_MIME_TYPES.has(
        file.type
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Unsupported file type",
        },
        {
          status:
            415,
        }
      );
    }

    log.info(
      {
        event:
          "knowledge.upload.started",

        mimeType:
          file.type ||
          "unknown",

        fileSizeBytes:
          file.size,
      },
      "Knowledge document upload started"
    );

    //--------------------------------------------------
    // Save Uploaded File
    //--------------------------------------------------

    const bytes =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(
        bytes
      );

    const uploadDir =
      path.join(
        process.cwd(),
        "public",
        "uploads",
        "knowledge"
      );

    await fs.mkdir(
      uploadDir,
      {
        recursive:
          true,
      }
    );

    const safeOriginalName =
      sanitizeFileName(
        file.name
      );

    const filename =
      `${Date.now()}-${safeOriginalName}`;

    const filePath =
      path.join(
        uploadDir,
        filename
      );

    savedFilePath =
      filePath;

    await fs.writeFile(
      filePath,
      buffer
    );

    log.info(
      {
        event:
          "knowledge.upload.file_saved",

        mimeType:
          file.type ||
          "unknown",

        fileSizeBytes:
          file.size,
      },
      "Knowledge document file saved"
    );

    //--------------------------------------------------
    // Save Document Metadata
    //--------------------------------------------------

    const document =
      await saveKnowledgeDocument({
        fileName:
          filename,

        originalName:
          file.name,

        mimeType:
          file.type,

        size:
          file.size,

        path:
          `/uploads/knowledge/${filename}`,
      });

    log.info(
      {
        event:
          "knowledge.upload.document_created",

        documentId:
          document.id,

        mimeType:
          file.type ||
          "unknown",

        fileSizeBytes:
          file.size,
      },
      "Knowledge document metadata created"
    );

    //--------------------------------------------------
    // Extract Text
    //--------------------------------------------------

    const text =
      await extractText(
        filePath,
        file.type
      );

    const normalizedText =
      text.trim();

    if (
      !normalizedText
    ) {
      throw new Error(
        "Document contains no extractable text"
      );
    }

    log.info(
      {
        event:
          "knowledge.upload.text_extracted",

        documentId:
          document.id,

        characterCount:
          normalizedText.length,
      },
      "Knowledge document text extracted"
    );

    //--------------------------------------------------
    // Create Chunks
    //--------------------------------------------------

    const chunks =
      chunkText(
        normalizedText
      );

    if (
      chunks.length ===
      0
    ) {
      throw new Error(
        "Document produced no knowledge chunks"
      );
    }

    log.info(
      {
        event:
          "knowledge.upload.chunks_created",

        documentId:
          document.id,

        chunkCount:
          chunks.length,

        totalCharacterCount:
          normalizedText.length,
      },
      "Knowledge document chunks created"
    );

    //--------------------------------------------------
    // Save Chunks
    //--------------------------------------------------

    await indexDocuments(
      document.id,
      chunks
    );

    log.info(
      {
        event:
          "knowledge.upload.completed",

        documentId:
          document.id,

        chunkCount:
          chunks.length,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Knowledge document upload completed"
    );

    return NextResponse.json({
      success:
        true,

      document,

      chunks:
        chunks.length,
    });
  } catch (
    error
  ) {
    /*
     * Remove the physical file when processing fails.
     * Database cleanup can be added later as a
     * transaction-based improvement.
     */
    if (
      savedFilePath
    ) {
      try {
        await fs.unlink(
          savedFilePath
        );
      } catch {
        // File may already be absent.
      }
    }

    log.error(
      {
        event:
          "knowledge.upload.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Knowledge document upload failed"
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Upload failed",
      },
      {
        status:
          500,
      }
    );
  }
}

//--------------------------------------------------
// Sanitize File Name
//--------------------------------------------------

function sanitizeFileName(
  originalName: string
): string {
  const baseName =
    path.basename(
      originalName
    );

  const sanitized =
    baseName
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )
      .replace(
        /_+/g,
        "_"
      )
      .slice(
        0,
        150
      );

  return sanitized ||
    "document";
}