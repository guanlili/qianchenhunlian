import { expect, test } from "@playwright/test"
import { findLastEmail } from "./utils/mailcatcher"
import { createUser } from "./utils/privateApi"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser } from "./utils/user"

test.use({ storageState: { cookies: [], origins: [] } })

// 邮件里的重置链接以后端配置的 FRONTEND_HOST 生成，本地 e2e 端口可能不同，
// 统一改写到当前 dev server 地址再访问
const normalizeResetUrl = (href: string) => {
  const port = process.env.E2E_PORT ?? "5173"
  const u = new URL(href)
  u.host = `localhost:${port}`
  return u.toString()
}

test("找回密码标题可见", async ({ page }) => {
  await page.goto("/recover-password")

  await expect(page.getByRole("heading", { name: "找回密码" })).toBeVisible()
})

test("输入框可见且可编辑", async ({ page }) => {
  await page.goto("/recover-password")

  await expect(page.getByTestId("email-input")).toBeVisible()
  await expect(page.getByTestId("email-input")).toHaveText("")
  await expect(page.getByTestId("email-input")).toBeEditable()
})

test("继续按钮可见", async ({ page }) => {
  await page.goto("/recover-password")

  await expect(page.getByRole("button", { name: "继续" })).toBeVisible()
})

test("通过邮件链接成功重置密码", async ({ page, request }) => {
  const email = randomEmail()
  const password = randomPassword()
  const newPassword = randomPassword()

  await createUser({ email, password })

  await page.goto("/recover-password")
  await page.getByTestId("email-input").fill(email)

  await page.getByRole("button", { name: "继续" }).click()

  const emailData = await findLastEmail({
    request,
    filter: (e) => e.recipients.includes(`<${email}>`),
    timeout: 5000,
  })

  await page.goto(
    `${process.env.MAILCATCHER_HOST}/messages/${emailData.id}.html`,
  )

  const selector = 'a[href*="/reset-password?token="]'

  const href = await page.getAttribute(selector, "href")
  const url = normalizeResetUrl(href!)

  // 设置新密码并确认
  await page.goto(url)

  await page.getByTestId("new-password-input").fill(newPassword)
  await page.getByTestId("confirm-password-input").fill(newPassword)
  await page.getByRole("button", { name: "重置密码" }).click()
  await expect(page.getByText("密码已更新, 请使用新密码登录")).toBeVisible()

  // 用新密码能重新登录
  await logInUser(page, email, newPassword)
})

test("无效或过期重置链接", async ({ page }) => {
  const password = randomPassword()
  const invalidUrl = "/reset-password?token=invalidtoken"

  await page.goto(invalidUrl)

  await page.getByTestId("new-password-input").fill(password)
  await page.getByTestId("confirm-password-input").fill(password)
  await page.getByRole("button", { name: "重置密码" }).click()

  // toast 展示后端 detail
  await expect(page.getByText("重置链接无效或已过期")).toBeVisible()
})

test("弱密码被前端校验拦截", async ({ page, request }) => {
  const email = randomEmail()
  const password = randomPassword()
  const weakPassword = "123"

  await createUser({ email, password })

  await page.goto("/recover-password")
  await page.getByTestId("email-input").fill(email)
  await page.getByRole("button", { name: "继续" }).click()

  const emailData = await findLastEmail({
    request,
    filter: (e) => e.recipients.includes(`<${email}>`),
    timeout: 5000,
  })

  await page.goto(
    `${process.env.MAILCATCHER_HOST}/messages/${emailData.id}.html`,
  )

  const selector = 'a[href*="/reset-password?token="]'

  const href = await page.getAttribute(selector, "href")
  const url = normalizeResetUrl(href!)

  // 填弱密码提交
  await page.goto(url)
  await page.getByTestId("new-password-input").fill(weakPassword)
  await page.getByTestId("confirm-password-input").fill(weakPassword)
  await page.getByRole("button", { name: "重置密码" }).click()

  await expect(page.getByText("密码至少需要 8 个字符")).toBeVisible()
})
