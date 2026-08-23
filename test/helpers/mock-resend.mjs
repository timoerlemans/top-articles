import { writeFile } from "node:fs/promises";

globalThis.fetch = async (_url, options) => {
  await writeFile(process.env.RESEND_OUTPUT_FILE, options.body, "utf8");
  return new Response(null, { status: 200 });
};
