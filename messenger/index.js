import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_TOKEN = process.env.DOORAY_API_TOKEN;
const BASE_URL = "https://api.dooray.com";

if (!API_TOKEN) {
  process.stderr.write("DOORAY_API_TOKEN environment variable is required\n");
  process.exit(1);
}

const headers = {
  "Authorization": `dooray-api ${API_TOKEN}`,
  "Content-Type": "application/json"
};

const server = new McpServer({
  name: "dooray-messenger-mcp",
  version: "1.0.0"
});

server.tool(
  "get-messenger-channels",
  "두레이 메신저 채널 목록 조회",
  {},
  async () => {
    const res = await fetch(`${BASE_URL}/messenger/v1/channels?page=0&size=20`, { headers });
    const text = await res.text();
    return { content: [{ type: "text", text: `HTTP ${res.status}\n${text}` }] };
  }
);

server.tool(
  "send-channel-message",
  "두레이 메신저 채널에 메시지 전송",
  {
    channelId: z.string().describe("채널 ID"),
    message: z.string().describe("보낼 메시지 내용")
  },
  async ({ channelId, message }) => {
    const res = await fetch(`${BASE_URL}/messenger/v1/channels/${channelId}/logs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: message })
    });
    const text = await res.text();
    return { content: [{ type: "text", text: `HTTP ${res.status}\n${text}` }] };
  }
);

server.tool(
  "get-my-member-info",
  "내 두레이 멤버 정보 조회",
  {},
  async () => {
    const res = await fetch(`${BASE_URL}/common/v1/members/me`, { headers });
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
