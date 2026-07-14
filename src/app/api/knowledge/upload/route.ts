import fs from "fs/promises";
import path from "path";
import { writeFile } from "fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { extractText } from "@/services/knowledge/parser";
import { chunkText } from "@/services/knowledge/chunker";

import { saveKnowledgeDocument } from "@/services/knowledge.service";
import { indexDocuments } from "@/services/knowledge/indexer.service";

export async function POST(
  request: NextRequest
) {
  try {
    console.log("\n==============================");
    console.log("Knowledge Upload Started");
    console.log("==============================\n");

    const formData =
      await request.formData();

    const file =
      formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          message: "No file uploaded",
        },
        {
          status: 400,
        }
      );
    }

    console.log("File Name :", file.name);
    console.log("Mime Type :", file.type);
    console.log("File Size :", file.size);

    //--------------------------------------------------
    // Save uploaded file
    //--------------------------------------------------

    const bytes =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(bytes);

    const uploadDir =
      path.join(
        process.cwd(),
        "public/uploads/knowledge"
      );

    await fs.mkdir(uploadDir, {
      recursive: true,
    });

    const filename =
      `${Date.now()}-${file.name}`;

    const filepath =
      path.join(
        uploadDir,
        filename
      );

    await writeFile(
      filepath,
      buffer
    );

    console.log("Saved File:");
    console.log(filepath);

    //--------------------------------------------------
    // Save document metadata
    //--------------------------------------------------

    const document =
      await saveKnowledgeDocument({
        fileName: filename,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        path: `/uploads/knowledge/${filename}`,
      });

    console.log("\nDocument Created");
    console.log(document);

    //--------------------------------------------------
    // Extract text
    //--------------------------------------------------

    console.log("\nExtracting text...");

    const text =
      await extractText(
        filepath,
        file.type
      );

    console.log("\n========== RAW TEXT ==========");
    console.log(text);
    console.log("==============================");

    if (!text.trim()) {
      throw new Error(
        "Document contains no text."
      );
    }

    //--------------------------------------------------
    // Create chunks
    //--------------------------------------------------

    console.log("\nCreating Chunks...");

    const chunks =
      chunkText(text);

    console.log(
      "Chunk Count:",
      chunks.length
    );

    chunks.forEach((chunk, index) => {
      console.log(
        `\nChunk ${index + 1}`
      );
      console.log(chunk);
    });

    //--------------------------------------------------
    // Save chunks
    //--------------------------------------------------

    console.log("\nIndexing...");

    await indexDocuments(
      document.id,
      chunks
    );

    console.log("\nUpload Complete");

    return NextResponse.json({
      success: true,
      document,
      chunks: chunks.length,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Upload failed",
      },
      {
        status: 500,
      }
    );
  }
}