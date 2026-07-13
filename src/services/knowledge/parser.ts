import fs from "fs/promises";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function extractText(
  filePath: string,
  mimeType: string
) {
  if (mimeType === "application/pdf") {
    const buffer = await fs.readFile(filePath);

    const pdf = await pdfParse(buffer);

    return pdf.text;
  }

  if (
    mimeType.includes("word") ||
    mimeType.includes("officedocument")
  ) {
    const result = await mammoth.extractRawText({
      path: filePath,
    });

    return result.value;
  }

  if (mimeType === "text/plain") {
    return await fs.readFile(filePath, "utf8");
  }

  throw new Error("Unsupported file");
}