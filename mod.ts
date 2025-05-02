// deno run --allow-net --allow-env webhook.ts

import { serve } from "https://deno.land/std/http/server.ts";

const notionToken = Deno.env.get("NOTION_TOKEN")!;
const db2Id = Deno.env.get("NOTION_DB2_ID")!;
const NOTION_VERSION = "2022-06-28";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Only POST allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const db1PageId = body?.event?.data?.id;

    if (!db1PageId) {
      return new Response("Missing page ID", { status: 400 });
    }

    // Fetch DB1 page that triggered the webhook
    const db1PageRes = await fetch(`https://api.notion.com/v1/pages/${db1PageId}`, {
      headers: {
        "Authorization": `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    const db1Page = await db1PageRes.json();
    const status1 = db1Page.properties?.Status?.status?.name;

    if (!status1) {
      return new Response("No Status found on triggering page", { status: 200 });
    }

    console.log(`DB1 Status changed to "${status1}" for page ${db1PageId}`);

    // Query DB2 for items where:
    // - "Project" relation contains db1PageId
    // - "Project Status Log" text equals status1
    const queryRes = await fetch(`https://api.notion.com/v1/databases/${db2Id}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: "Project",
              relation: {
                contains: db1PageId,
              },
            },
            {
              property: "Project Status Log",
              rich_text: {
                equals: status1,
              },
            },
          ],
        },
      }),
    });

    const queryData = await queryRes.json();
    const db2Matches = queryData.results || [];

    if (db2Matches.length === 0) {
      return new Response("No matching DB2 pages found", { status: 200 });
    }

    for (const match of db2Matches) {
      const pageId = match.id;
      console.log(`Updating DB2 page ${pageId} to Status: Done`);

      await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${notionToken}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            Status: {
              select: {
                name: "Done",
              },
            },
          },
        }),
      });
    }

    return new Response("Updated matching DB2 pages", { status: 200 });
  } catch (err) {
    console.error("Error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
