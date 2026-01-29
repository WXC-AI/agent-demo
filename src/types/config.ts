import { z } from 'zod';

export const DeepSeekConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://api.deepseek.com'),
  model: z.string().default('deepseek-chat'),
  temperature: z.number().min(0).max(2).default(0.1),
});

export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  transport: z.enum(['stdio']).default('stdio'),
});

export const SkillsConfigSchema = z.object({
  /** 技能目录路径，默认为 ./src/buildinSkills */
  directory: z.string().default('./src/buildinSkills'),
});

export const ConfigSchema = z.object({
  deepseek: DeepSeekConfigSchema,
  mcpServers: z.record(z.string(), MCPServerConfigSchema),
  skills: SkillsConfigSchema.optional(),
  logging: z
    .object({
      level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
      format: z.string().optional(),
    })
    .optional(),
});

export type DeepSeekConfig = z.infer<typeof DeepSeekConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
