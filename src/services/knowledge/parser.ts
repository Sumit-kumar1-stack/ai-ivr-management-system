import fs from "fs/promises";
import mammoth from "mammoth";
import PDFParser from "pdf2json";

export async function extractText(
  filePath: string,
  mimeType: string
): Promise<string> {

  // ===========================
  // PDF
  // ===========================
  if (mimeType === "application/pdf") {

    return new Promise((resolve, reject) => {

      const pdf = new PDFParser();

      pdf.on(
        "pdfParser_dataError",
        (err: any) => {
          reject(err?.parserError ?? err);
        }
      );

      pdf.on(
        "pdfParser_dataReady",
        (pdfData: any) => {

          let result = "";

          for (const page of pdfData.Pages) {

            for (const text of page.Texts) {

              for (const run of text.R) {

                let value = run.T;

                // Decode only if possible
                try {
                  value = decodeURIComponent(value);
                } catch {
                  // Ignore malformed URI
                }

                result += value + " ";
              }

              result += "\n";
            }

            result += "\n";
          }

          console.log("\n========== PDF TEXT ==========");
          console.log(result);
          console.log("==============================\n");

          resolve(result);
        }
      );

      pdf.loadPDF(filePath);

    });

  }

  // ===========================
  // DOCX
  // ===========================
  if (
    mimeType.includes("word") ||
    mimeType.includes("officedocument")
  ) {

    const result =
      await mammoth.extractRawText({
        path: filePath,
      });

    return result.value;

  }

  // ===========================
  // TXT
  // ===========================
  if (mimeType === "text/plain") {

    return await fs.readFile(
      filePath,
      "utf8"
    );

  }

  throw new Error("Unsupported file type");

}