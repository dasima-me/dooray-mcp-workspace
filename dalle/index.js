#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import https from 'https';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  process.stderr.write('OPENAI_API_KEY environment variable is required\n');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(e) {
  return {
    content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
    isError: true,
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools = [
  {
    name: 'generate-image',
    description: 'DALL-E 3로 이미지를 생성합니다. 생성된 이미지 URL과 로컬 저장 경로를 반환합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '이미지 생성 프롬프트 (영어 또는 한국어)' },
        size: {
          type: 'string',
          enum: ['1024x1024', '1792x1024', '1024x1792'],
          description: '이미지 크기 (기본값: 1024x1024)',
        },
        quality: {
          type: 'string',
          enum: ['standard', 'hd'],
          description: '이미지 품질 (기본값: standard)',
        },
        style: {
          type: 'string',
          enum: ['vivid', 'natural'],
          description: '이미지 스타일 - vivid: 선명하고 드라마틱, natural: 자연스럽고 사실적 (기본값: vivid)',
        },
        savePath: {
          type: 'string',
          description: '이미지를 저장할 경로 (기본값: C:/Users/NHN/Pictures/dalle)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'edit-image',
    description: 'DALL-E 2로 기존 이미지를 수정합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: '원본 이미지 파일 경로 (PNG, 최대 4MB)' },
        prompt: { type: 'string', description: '수정 내용 프롬프트' },
        size: {
          type: 'string',
          enum: ['256x256', '512x512', '1024x1024'],
          description: '출력 이미지 크기 (기본값: 1024x1024)',
        },
      },
      required: ['imagePath', 'prompt'],
    },
  },
];

// ── Handlers ──────────────────────────────────────────────────────────────────

const GenerateImageSchema = z.object({
  prompt: z.string(),
  size: z.enum(['1024x1024', '1792x1024', '1024x1792']).optional(),
  quality: z.enum(['standard', 'hd']).optional(),
  style: z.enum(['vivid', 'natural']).optional(),
  savePath: z.string().optional(),
});

const EditImageSchema = z.object({
  imagePath: z.string(),
  prompt: z.string(),
  size: z.enum(['256x256', '512x512', '1024x1024']).optional(),
});

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', (e) => { fs.unlink(filepath, () => {}); reject(e); });
  });
}

const handlers = {
  'generate-image': async (args) => {
    const { prompt, size = '1024x1024', quality, style, savePath } = GenerateImageSchema.parse(args);

    // Try gpt-image-1 first, fall back to dall-e-3, then dall-e-2
    let response;
    let usedModel;
    const models = ['gpt-image-1', 'dall-e-3', 'dall-e-2'];
    let lastError;
    for (const model of models) {
      try {
        usedModel = model;
        const dall2Size = ['256x256', '512x512', '1024x1024'].includes(size) ? size : '1024x1024';
        const params = { model, prompt, n: 1, size: model === 'dall-e-2' ? dall2Size : size };
        if (model !== 'dall-e-2') {
          if (quality) params.quality = quality;
          if (style) params.style = style;
        }
        response = await openai.images.generate(params);
        break;
      } catch (e) {
        lastError = e;
        if (e?.status === 400 && e?.message?.includes('does not exist')) continue;
        throw e;
      }
    }
    if (!response) throw lastError;

    const imageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt;

    // 로컬에 저장
    const saveDir = savePath || 'C:/Users/NHN/Pictures/dalle';
    fs.mkdirSync(saveDir, { recursive: true });
    const filename = `dalle_${Date.now()}.png`;
    const filepath = path.join(saveDir, filename);
    await downloadImage(imageUrl, filepath);

    return ok({
      url: imageUrl,
      savedPath: filepath,
      revisedPrompt,
      model: usedModel,
      size,
      quality,
      style,
    });
  },

  'edit-image': async (args) => {
    const { imagePath, prompt, size = '1024x1024' } = EditImageSchema.parse(args);

    const imageData = fs.createReadStream(imagePath);
    const response = await openai.images.edit({
      model: 'dall-e-2',
      image: imageData,
      prompt,
      n: 1,
      size,
    });

    const imageUrl = response.data[0].url;
    const saveDir = path.dirname(imagePath);
    const filename = `edited_${Date.now()}.png`;
    const filepath = path.join(saveDir, filename);
    await downloadImage(imageUrl, filepath);

    return ok({ url: imageUrl, savedPath: filepath });
  },
};

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'dalle-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const handler = handlers[name];
  if (!handler) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    return await handler(args || {});
  } catch (e) {
    return err(e);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('DALL-E MCP Server started\n');
