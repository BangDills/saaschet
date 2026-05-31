/**
 * Custom Next.js server for cPanel (Phusion Passenger).
 *
 * cPanel's "Setup Node.js App" loads this file as the app entry-point.
 * It uses Next.js's programmatic API so we don't depend on `next start`
 * being on PATH.
 *
 * Local usage:  NODE_ENV=production node server.js
 * cPanel usage: set "Application startup file" = server.js
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  })
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
