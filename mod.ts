// deno run --allow-net --allow-env webhook.ts

import { serve } from "https://deno.land/std/http/server.ts";

const notionToken = Deno.env.get("NOTION_TOKEN")!;
const db1Id = Deno.env.get("NOTION_DB1_ID")!;
const db2Id = Deno.env.get("NOTION_DB2_ID")!;

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Only POST requests allowed", { status: 405 });
  }

  const body = await req.json();

  const changedPageId = body?.event?.data?.id;
  if (!changedPageId) {
    return new Response("Invalid payload", { status: 400 });
  }

  // Get the updated page content
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${changedPageId}`, {
    headers: {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
    },
  });

  const pageData = await pageRes.json();

  // Extract new status value
  const status1 = pageData.properties?.Status?.select?.name;

  if (!status1) {
    return new Response("No status found", { status: 200 });
  }

  // Example: map DB1 page to DB2 page by some shared key (e.g., Name or External ID)
  const name = pageData.properties?.Name?.title?.[0]?.plain_text;
  if (!name) {
    return new Response("No name found to match DB2 record", { status: 200 });
  }

  // Search DB2 for matching page
  const searchRes = await fetch(`https://api.notion.com/v1/databases/${db2Id}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: {
        property: "Name",
        title: {
          equals: name,
        },
      },
    }),
  });

  const searchData = await searchRes.json();
  const targetPageId = searchData.results?.[0]?.id;

  if (!targetPageId) {
    return new Response("No matching DB2 record found", { status: 200 });
  }

  // Update status in DB2
  await fetch(`https://api.notion.com/v1/pages/${targetPageId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
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

  return new Response("Status synced!", { status: 200 });
});
