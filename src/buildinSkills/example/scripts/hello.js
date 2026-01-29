#!/usr/bin/env node
// 示例脚本：打印问候语，第一个参数为称呼，默认 "World"
const name = process.argv[2] || 'World';
console.log(`Hello, ${name}! (from example skill script)`);
