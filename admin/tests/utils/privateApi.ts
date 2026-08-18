// E2E 造测试用户: 用超管身份调 /users (后端已无 /private/users, 模板遗留已迁移)
import { OpenAPI, UsersService } from "../../src/client"

OpenAPI.BASE = `${process.env.VITE_API_URL}`

export const createUser = async ({
  email,
  password,
}: {
  email: string
  password: string
}) => {
  return await UsersService.createUser({
    requestBody: {
      email,
      password,
      full_name: "Test User",
    },
  })
}
