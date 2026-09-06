// E2E 造测试用户: 用超管身份调 /users (后端已无 /private/users, 模板遗留已迁移)
// 注意: POST /users 需要超管鉴权, 这里用首个超管登录换 token
import { LoginService, OpenAPI, UsersService } from "../../src/client"
import { firstSuperuser, firstSuperuserPassword } from "../config.ts"

OpenAPI.BASE = `${process.env.VITE_API_URL}`

let superuserToken: string | undefined

async function ensureSuperuserToken() {
  if (!superuserToken) {
    const resp = await LoginService.loginAccessToken({
      formData: {
        username: firstSuperuser,
        password: firstSuperuserPassword,
      },
    })
    superuserToken = resp.access_token
  }
  OpenAPI.TOKEN = superuserToken
}

export const createUser = async ({
  email,
  password,
}: {
  email: string
  password: string
}) => {
  await ensureSuperuserToken()
  return await UsersService.createUser({
    requestBody: {
      email,
      password,
      full_name: "测试用户",
    },
  })
}
