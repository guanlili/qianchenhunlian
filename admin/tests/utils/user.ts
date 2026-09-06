import { expect, type Page } from "@playwright/test"

export async function logInUser(page: Page, email: string, password: string) {
  await page.goto("/login")

  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByRole("button", { name: "登录" }).click()
  // 登录后统一落门店入口（总部 → /stores，门店管理员 → /stores/{id}）
  await page.waitForURL("**/stores**")
  // 侧边栏用户菜单出现即代表已进入受保护布局
  await expect(page.getByTestId("user-menu")).toBeVisible()
}

export async function logOutUser(page: Page) {
  await page.getByTestId("user-menu").click()
  await page.getByRole("menuitem", { name: "退出登录" }).click()
  await page.goto("/login")
}
