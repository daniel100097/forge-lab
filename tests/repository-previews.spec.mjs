import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Disposable fixture required");
const { user } = JSON.parse(
  await readFile(directory + "/credentials.json", "utf8"),
);
async function login(page) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test("native upload previews images CSV audio 3D terminal recording binary and large-file states", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const name = `zz-test-previews-${Date.now()}`,
    root = `/-/ui/projects/zz-test-studio/${name}`;
  await page.goto("/-/ui/projects/new");
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${name}$`));
  const wav = Buffer.alloc(44 + 8000);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(8000, 40);
  wav.fill(128, 44);
  const pdfParts = ["%PDF-1.4\n"];
  const offsets = [0];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdfParts.join("")));
    pdfParts.push(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });
  const xref = Buffer.byteLength(pdfParts.join(""));
  pdfParts.push(
    `xref\n0 5\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join(
        "",
      )}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const files = [
    ["document.pdf", "application/pdf", Buffer.from(pdfParts.join(""))],
    [
      "picture.png",
      "image/png",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    [
      "table.csv",
      "text/csv",
      Buffer.from('Name,Notes\nAtlas,"A quoted, value"\n'),
    ],
    ["audio.wav", "audio/wav", wav],
    [
      "triangle.stl",
      "model/stl",
      Buffer.from(
        "solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle\n",
      ),
    ],
    [
      "terminal.cast",
      "application/x-asciicast",
      Buffer.from(
        '{"version":2,"width":40,"height":8,"timestamp":0}\n[0.1,"o","Hello terminal\\r\\n"]\n[1.0,"o","Done\\r\\n"]\n',
      ),
    ],
    ["data.bin", "application/octet-stream", Buffer.from([0, 1, 2, 255])],
    ["large.txt", "text/plain", Buffer.alloc(530000, "A")],
  ];
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    await page.goto(root + "/upload?ref=zz-test-main");
    await page
      .getByLabel("Choose files to upload")
      .setInputFiles(
        batch.map(([name, mimeType, buffer]) => ({ name, mimeType, buffer })),
      );
    await expect(page.locator(".file-upload-list li")).toHaveCount(
      batch.length,
    );
    await page
      .getByRole("button", { name: "Commit changes", exact: true })
      .click();
    await expect(page).not.toHaveURL(/\/upload/);
  }

  const file = async (name) => {
    await page.goto(
      root + "?ref=zz-test-main&path=" + encodeURIComponent(name),
    );
  };
  await file("document.pdf");
  await expect(page.locator(".pdf-preview")).toBeVisible();
  await expect(page.locator(".pdf-preview")).toHaveAttribute("src", /^blob:/);
  await file("picture.png");
  await expect(page.locator(".image-preview img")).toBeVisible();
  expect(
    await page
      .locator(".image-preview img")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  await file("table.csv");
  await expect(page.locator(".delimited-preview")).toContainText(
    "A quoted, value",
  );
  await page
    .getByRole("button", { name: "View source code", exact: true })
    .click();
  await expect(page.locator(".source-code")).toContainText('"A quoted, value"');
  await file("audio.wav");
  await expect(page.locator("audio")).toBeVisible();
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.duration))
    .toBe(1);
  await file("triangle.stl");
  await expect(
    page.getByRole("img", { name: "3D preview of triangle.stl", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await file("terminal.cast");
  await expect(page.locator(".ap-wrapper")).toBeVisible({ timeout: 20000 });
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await file("data.bin");
  await expect(
    page.getByRole("heading", { name: /Binary file/ }),
  ).toBeVisible();
  await file("large.txt");
  await expect(
    page.getByRole("heading", { name: /exceeds the preview limit/i }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
