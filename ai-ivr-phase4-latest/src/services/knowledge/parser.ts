import fs from "fs/promises";

import mammoth from "mammoth";
import PDFParser from "pdf2json";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Types
//--------------------------------------------------

interface PdfTextRun {
  T?: string;
}

interface PdfTextItem {
  R?: PdfTextRun[];
}

interface PdfPage {
  Texts?: PdfTextItem[];
}

interface PdfData {
  Pages?: PdfPage[];
}

interface PdfParserError {
  parserError?: unknown;
}

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "knowledge-parser"
  );

//--------------------------------------------------
// Extract Text
//--------------------------------------------------

export async function extractText(
  filePath: string,
  mimeType: string
): Promise<string> {
  const startedAt =
    process.hrtime.bigint();

  try {
    let text: string;

    if (
      mimeType ===
      "application/pdf"
    ) {
      text =
        await extractPdfText(
          filePath
        );
    } else if (
      mimeType.includes(
        "word"
      ) ||
      mimeType.includes(
        "officedocument"
      )
    ) {
      text =
        await extractDocxText(
          filePath
        );
    } else if (
      mimeType ===
      "text/plain"
    ) {
      text =
        await fs.readFile(
          filePath,
          "utf8"
        );
    } else {
      throw new Error(
        "Unsupported file type"
      );
    }

    log.debug(
      {
        event:
          "knowledge.parser.completed",

        mimeType,

        characterCount:
          text.length,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Knowledge document text extraction completed"
    );

    return text;
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "knowledge.parser.failed",

        mimeType,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Knowledge document text extraction failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Extract PDF Text
//--------------------------------------------------

function extractPdfText(
  filePath: string
): Promise<string> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const pdf =
        new PDFParser();

      pdf.on(
        "pdfParser_dataError",
        (
          error:
            PdfParserError |
            unknown
        ) => {
          if (
            typeof error ===
              "object" &&
            error !==
              null &&
            "parserError" in
              error
          ) {
            reject(
              (
                error as
                  PdfParserError
              ).parserError
            );

            return;
          }

          reject(
            error
          );
        }
      );

      pdf.on(
        "pdfParser_dataReady",
        (
          pdfData:
            PdfData
        ) => {
          try {
            const result =
              buildPdfText(
                pdfData
              );

            log.debug(
              {
                event:
                  "knowledge.parser.pdf_extracted",

                characterCount:
                  result.length,

                pageCount:
                  pdfData.Pages
                    ?.length ??
                  0,
              },
              "PDF text extracted"
            );

            resolve(
              result
            );
          } catch (
            error
          ) {
            reject(
              error
            );
          }
        }
      );

      pdf.loadPDF(
        filePath
      );
    }
  );
}

//--------------------------------------------------
// Build PDF Text
//--------------------------------------------------

function buildPdfText(
  pdfData: PdfData
): string {
  let result =
    "";

  for (
    const page of
    pdfData.Pages ??
    []
  ) {
    for (
      const textItem of
      page.Texts ??
      []
    ) {
      for (
        const run of
        textItem.R ??
        []
      ) {
        const encodedValue =
          run.T ??
          "";

        let decodedValue =
          encodedValue;

        try {
          decodedValue =
            decodeURIComponent(
              encodedValue
            );
        } catch {
          // Preserve original value when decoding fails.
        }

        result +=
          `${decodedValue} `;
      }

      result +=
        "\n";
    }

    result +=
      "\n";
  }

  return result;
}

//--------------------------------------------------
// Extract DOCX Text
//--------------------------------------------------

async function extractDocxText(
  filePath: string
): Promise<string> {
  const result =
    await mammoth.extractRawText({
      path:
        filePath,
    });

  return result.value;
}