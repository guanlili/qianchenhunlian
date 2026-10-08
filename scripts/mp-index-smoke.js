#!/usr/bin/env node
/**
 * 小程序页面模块「加载期」烟雾测试 (拆分护栏 · 第五道)。
 *
 * 背景: index.js 拆分为 logic/{wizard,filters,shared} 后, 曾出现三类
 * node --check 查不出的加载期断链 (2026-10-08 DevTools 走查抓出):
 *   1. require 绑定改名后旧标识符残留 (wizard → wizardUtil)
 *   2. 定义行切割丢失 (_INCOME_BUCKETS 只切走了用法和导出)
 *   3. logic/ 子目录的 require 路径深度错 (../../ 应为 ../../../)
 * 三者都在模块求值期抛 ReferenceError / MODULE_NOT_FOUND —— 本脚本在
 * Node 里 stub 微信全局后真实 require 各模块, 让这类问题在提交前必红。
 *
 * 用法: node scripts/mp-index-smoke.js   (仓库根目录)
 * 拆分新页面 (详情/联系流/我的页) 时, 把对应模块加进 MODULES。
 */

const path = require("path")

// —— 微信全局 stub: 只求模块能完成求值, 不模拟行为 ——
global.Page = () => {}
global.App = () => {}
global.Component = () => {}
global.getApp = () => ({})
global.getCurrentPages = () => []
global.wx = new Proxy(
  {},
  {
    get(target, key) {
      if (key in target) return target[key]
      if (key === "getStorageSync") return () => ({})
      if (key === "getSystemInfoSync") return () => ({})
      // 兜底: 其余 wx.* 一律返回可调用 (模块顶层的防御性调用不至于炸)
      return () => ({})
    },
  },
)

const ROOT = path.resolve(__dirname, "..")
const MODULES = [
  "miniprogram/pages/index/logic/shared.js",
  "miniprogram/pages/index/logic/filters.js",
  "miniprogram/pages/index/logic/wizard.js",
  "miniprogram/pages/index/index.js",
]

let failed = false
for (const rel of MODULES) {
  try {
    require(path.join(ROOT, rel))
    console.log(`✓ 加载成功 ${rel}`)
  } catch (e) {
    failed = true
    console.error(`✗ 加载失败 ${rel}: ${e.message}`)
  }
}

// 关键导出必须真实存在 (防「解构出 undefined 静默漏网」)
const shared = require(path.join(ROOT, "miniprogram/pages/index/logic/shared.js"))
const filters = require(path.join(ROOT, "miniprogram/pages/index/logic/filters.js"))
const wizard = require(path.join(ROOT, "miniprogram/pages/index/logic/wizard.js"))

const checks = [
  ["shared._pickGlyph", typeof shared._pickGlyph, "function"],
  ["shared._joinRegionLabel", typeof shared._joinRegionLabel, "function"],
  ["shared.adaptCard", typeof shared.adaptCard, "function"],
  ["filters._INCOME_BUCKETS", Array.isArray(filters._INCOME_BUCKETS) ? "array" : "not-array", "array"],
  ["filters.filtersFragment", typeof filters.filtersFragment, "object"],
  ["wizard.wizardFragment", typeof wizard.wizardFragment, "object"],
]
for (const [name, actual, expected] of checks) {
  const ok = actual === expected
  if (!ok) failed = true
  console.log(`${ok ? "✓" : "✗"} ${name}: ${actual}${ok ? "" : ` (期望 ${expected})`}`)
}

process.exit(failed ? 1 : 0)
