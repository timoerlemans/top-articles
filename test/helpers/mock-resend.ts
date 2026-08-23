import { writeFile } from "node:fs/promises";

globalThis.fetch = async (_url: URL | string | Request, options?: RequestInit) => {
  const outputPath = process.env.RESEND_OUTPUT_FILE;
  if (!outputPath || typeof options?.body !== "string") {
    throw new TypeError("Mock Resend vereist een uitvoerpad en tekstbody.");
  }
  await writeFile(outputPath, options.body, "utf8");
  return Response.json({ id: "test-email-id" }, { status: 200 });
};
