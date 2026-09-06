import { expect, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"
import { createUser } from "./utils/privateApi.ts"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser, logOutUser } from "./utils/user"

const tabs = ["个人资料", "修改密码", "危险操作"]

// 个人资料

test("个人资料 tab 默认选中", async ({ page }) => {
  await page.goto("/settings")
  await expect(page.getByRole("tab", { name: "个人资料" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
})

test("全部 tab 可见", async ({ page }) => {
  await page.goto("/settings")
  for (const tab of tabs) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible()
  }
})

test.describe("成功编辑姓名与邮箱", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("修改姓名为合法值", async ({ page }) => {
    const email = randomEmail()
    const updatedName = "测试用户 2"
    const password = randomPassword()

    await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "个人资料" }).click()
    await page.getByRole("button", { name: "编辑" }).click()
    await page.getByLabel("姓名").fill(updatedName)
    await page.getByRole("button", { name: "保存" }).click()
    await expect(page.getByText("资料已保存")).toBeVisible()
    // 页面上展示新姓名
    await expect(
      page.locator("form").getByText(updatedName, { exact: true }),
    ).toBeVisible()
  })

  test("修改邮箱为合法值", async ({ page }) => {
    const email = randomEmail()
    const updatedEmail = randomEmail()
    const password = randomPassword()

    await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "个人资料" }).click()
    await page.getByRole("button", { name: "编辑" }).click()
    await page.getByLabel("邮箱").fill(updatedEmail)
    await page.getByRole("button", { name: "保存" }).click()
    await expect(page.getByText("资料已保存")).toBeVisible()
    await expect(
      page.locator("form").getByText(updatedEmail, { exact: true }),
    ).toBeVisible()
  })
})

test.describe("非法输入被拦截", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("邮箱格式不合法", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const invalidEmail = ""

    await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "个人资料" }).click()
    await page.getByRole("button", { name: "编辑" }).click()
    await page.getByLabel("邮箱").fill(invalidEmail)
    await page.locator("body").click()
    await expect(page.getByText("邮箱格式不正确")).toBeVisible()
  })

  test("取消编辑恢复原姓名", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const updatedName = "测试用户"

    const user = await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "个人资料" }).click()
    await page.getByRole("button", { name: "编辑" }).click()
    await page.getByLabel("姓名").fill(updatedName)
    await page.getByRole("button", { name: "取消" }).first().click()
    await expect(
      page.locator("form").getByText(user.full_name as string, { exact: true }),
    ).toBeVisible()
  })

  test("取消编辑恢复原邮箱", async ({ page }) => {
    const email = randomEmail()
    const updatedEmail = randomEmail()
    const password = randomPassword()

    await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "个人资料" }).click()
    await page.getByRole("button", { name: "编辑" }).click()
    await page.getByLabel("邮箱").fill(updatedEmail)
    await page.getByRole("button", { name: "取消" }).first().click()
    await expect(
      page.locator("form").getByText(email, { exact: true }),
    ).toBeVisible()
  })
})

// 修改密码

test.describe("成功修改密码", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("更新密码成功且可用新密码登录", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const NewPassword = randomPassword()

    await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "修改密码" }).click()
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(NewPassword)
    await page.getByTestId("confirm-password-input").fill(NewPassword)
    await page.getByRole("button", { name: "更新密码" }).click()
    await expect(page.getByText("密码已更新")).toBeVisible()

    await logOutUser(page)

    // 新密码能登录
    await logInUser(page, email, NewPassword)
  })
})

test.describe("非法密码被拦截", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("弱密码被前端校验拦截", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const weakPassword = "weak"

    await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "修改密码" }).click()
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(weakPassword)
    await page.getByTestId("confirm-password-input").fill(weakPassword)
    await page.getByRole("button", { name: "更新密码" }).click()
    await expect(page.getByText("密码至少需要 8 个字符")).toBeVisible()
  })

  test("两次输入的新密码不一致", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const newPassword = randomPassword()
    const confirmPassword = randomPassword()

    await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "修改密码" }).click()
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(newPassword)
    await page.getByTestId("confirm-password-input").fill(confirmPassword)
    await page.getByRole("button", { name: "更新密码" }).click()
    await expect(page.getByText("两次输入的密码不一致")).toBeVisible()
  })

  test("新密码与当前密码相同", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()

    await createUser({ email, password })

    // 登录该用户
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "修改密码" }).click()
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(password)
    await page.getByTestId("confirm-password-input").fill(password)
    await page.getByRole("button", { name: "更新密码" }).click()
    // toast 展示后端 detail（该错误信息暂为英文）
    await expect(
      page.getByText("New password cannot be the same as the current one"),
    ).toBeVisible()
  })
})

// 外观

test("侧边栏主题按钮可见", async ({ page }) => {
  await page.goto("/settings")
  await expect(page.getByTestId("theme-button")).toBeVisible()
})

test("可在明暗主题间切换", async ({ page }) => {
  await page.goto("/settings")

  await page.getByTestId("theme-button").click()
  await page.getByTestId("dark-mode").click()
  await expect(page.locator("html")).toHaveClass(/dark/)

  // 等下拉关闭后再打开
  await expect(page.getByTestId("dark-mode")).not.toBeVisible()

  await page.getByTestId("theme-button").click()
  await page.getByTestId("light-mode").click()
  await expect(page.locator("html")).toHaveClass(/light/)
})

test("主题选择跨会话保留", async ({ page }) => {
  await page.goto("/settings")

  await page.getByTestId("theme-button").click()
  if (
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    )
  ) {
    await page.getByTestId("light-mode").click()
    await page.getByTestId("theme-button").click()
  }

  const isLightMode = await page.evaluate(() =>
    document.documentElement.classList.contains("light"),
  )
  expect(isLightMode).toBe(true)

  await page.getByTestId("theme-button").click()
  await page.getByTestId("dark-mode").click()
  let isDarkMode = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  )
  expect(isDarkMode).toBe(true)

  await logOutUser(page)
  await logInUser(page, firstSuperuser, firstSuperuserPassword)

  isDarkMode = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  )
  expect(isDarkMode).toBe(true)
})
