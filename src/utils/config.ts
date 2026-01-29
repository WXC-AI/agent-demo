import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { Config, ConfigSchema } from '../types/config.js';
import { resolve } from 'path';

/**
 * 加载并解析配置文件
 * 支持环境变量替换 ${VAR_NAME} 格式
 */
export function loadConfig(configPath: string = 'config.yaml'): Config {
  const fullPath = resolve(configPath);
  const content = readFileSync(fullPath, 'utf-8');

  // 替换环境变量 ${VAR_NAME} 格式
  const processedContent = content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] || match;
  });

  const rawConfig = parse(processedContent);

  // 转换配置格式以匹配我们的 schema
  const config = {
    deepseek: {
      apiKey: rawConfig.deepseek?.api_key || rawConfig.deepseek?.apiKey,
      baseUrl: rawConfig.deepseek?.base_url || rawConfig.deepseek?.baseUrl,
      model: rawConfig.deepseek?.model,
      temperature: rawConfig.deepseek?.temperature,
    },
    mcpServers: rawConfig.mcp_servers || rawConfig.mcpServers,
    skills: rawConfig.skills,
    logging: rawConfig.logging,
  };

  return ConfigSchema.parse(config);
}
