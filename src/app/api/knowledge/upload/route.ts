import fs from "fs/promises";
import path from "path";
import { writeFile } from "fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { extractText } from "@/services/knowledge/parser";
import { chunkText } from "@/services/knowledge/chunker";
import {
  saveKnowledgeDocument,
  saveChunks,
} from "@/services/knowledge.service";

export async function POST(
  request: NextRequest
) {

  const formData =
    await request.formData();

  const file =
    formData.get("file") as File;

  if (!file) {

    return NextResponse.json(
      {
        success:false,
        message:"No file uploaded"
      },
      {status:400}
    );

  }

  const bytes =
    await file.arrayBuffer();

  const buffer =
    Buffer.from(bytes);

  const uploadDir =
    path.join(
      process.cwd(),
      "public/uploads/knowledge"
    );

  await fs.mkdir(uploadDir,{
    recursive:true
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

  const document =
    await saveKnowledgeDocument({

      fileName:filename,

      originalName:file.name,

      mimeType:file.type,

      size:file.size,

      path:`/uploads/knowledge/${filename}`

    });

    const text = await extractText(
  filepath,
  file.type
);

const chunks = chunkText(text);

await saveChunks(
  document.id,
  chunks
);

return NextResponse.json({
  success: true,
  document,
  chunks: chunks.length,
});

}