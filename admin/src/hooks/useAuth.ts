import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import {
  type Body_login_login_access_token as AccessToken,
  LoginService,
  type WhoAmI,
} from "@/client"
import { handleError } from "@/utils"
import useCustomToast from "./useCustomToast"

const isLoggedIn = () => {
  // 判 refresh_token: access 可能已过期(惰性刷新会自动补), refresh 在 = 会话有效
  return localStorage.getItem("refresh_token") !== null
}

const useAuth = () => {
  const navigate = useNavigate()
  const { showErrorToast } = useCustomToast()

  // 用 /login/whoami: 同时兼容 superuser 和 staff
  const { data: user } = useQuery<WhoAmI | null, Error>({
    queryKey: ["currentUser"],
    queryFn: LoginService.whoami,
    enabled: isLoggedIn(),
  })

  const login = async (data: AccessToken) => {
    const response = await LoginService.loginAccessToken({
      formData: data,
    })
    localStorage.setItem("access_token", response.access_token)
    // refresh_token 字段需重新生成 client 后才有类型; 暂用兼容取法
    const refresh = (response as unknown as { refresh_token?: string })
      .refresh_token
    if (refresh) localStorage.setItem("refresh_token", refresh)
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      // 以门店为主体: 门店管理员登录直达本店工作台, 总部落全局工作台
      try {
        const me = await LoginService.whoami()
        if (me.actor_type === "staff" && me.store_id) {
          navigate({ to: "/stores/$storeId", params: { storeId: me.store_id } })
          return
        }
      } catch {
        // whoami 失败不阻塞登录, 落默认工作台
      }
      navigate({ to: "/dashboard" })
    },
    onError: handleError.bind(showErrorToast),
  })

  const logout = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    navigate({ to: "/login" })
  }

  return {
    loginMutation,
    logout,
    user,
  }
}

export { isLoggedIn }
export default useAuth
