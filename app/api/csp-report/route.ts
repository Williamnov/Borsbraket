import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Where the browser posts Content-Security-Policy violations.
 *
 * The policy in middleware.ts ships report-only, which means a directive
 * that is wrong produces one of these instead of a blank page. Without
 * somewhere to send them the reports only exist in whichever console
 * happened to be open at the time, which is how a missing connect-src
 * origin stays undiscovered until it breaks something.
 *
 * This only logs. Vercel keeps the function logs, which is enough to see
 * which directive is short and by what. Once the policy is enforcing and
 * quiet, this route and the report-uri beside it can both go.
 *
 * It is deliberately unauthenticated — the browser posting a report has
 * no session to offer — so it is also a free endpoint for anyone who
 * wants to fill the logs. Hence the size cap and the flat 204: it reads
 * at most one small body, writes one line, and tells the caller nothing.
 */

/** Longer than any real report; a violation is a few hundred bytes. */
const MAX_BYTES = 8_192;

type Report = {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
};

export async function POST(request: NextRequest) {
  // 204 whatever happens: the browser does nothing useful with an error
  // here, and a report that cannot be parsed is not worth a 400.
  try {
    const raw = await request.text();
    if (raw.length > 0 && raw.length <= MAX_BYTES) {
      // report-uri wraps the report under "csp-report"; the newer
      // report-to spelling nests it under "body". Either way the fields
      // below are the same, and a shape that matches neither is read as
      // the report itself.
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const nested = (parsed["csp-report"] ?? parsed.body) as Report | undefined;
      const report: Report = nested ?? (parsed as Report);

      const directive = report["effective-directive"] ?? report["violated-directive"] ?? "?";
      const blocked = report["blocked-uri"] ?? "?";
      const page = report["document-uri"] ?? "?";

      // One line, so a run of them reads as a list of what to add.
      console.warn(`[csp] ${directive} blocked ${blocked} on ${page}`);
    }
  } catch {
    // A malformed report is not worth a stack trace.
  }

  return new NextResponse(null, { status: 204 });
}
