import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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

/** 当前登录人查询 (唯一 key 定义): 路由 beforeLoad 与组件 useQuery 共用同一份缓存 */
export function currentUserQueryOptions() {
  return {
    // 用 /login/whoami: 同时兼容 superuser 和 staff
    queryKey: ["currentUser"],
    queryFn: () => LoginService.whoami(),
  }
}

const useAuth = () => {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { showErrorToast } = useCustomToast()

  // 命中 _layout beforeLoad ensureQueryData 的缓存, 登录后不再重复请求 whoami
  const { data: user } = useQuery<WhoAmI | null, Error>({
    ...currentUserQueryOptions(),
    enabled: isLoggedIn(),
  })

  const login = async (data: AccessToken) => {
    const response = await LoginService.loginAccessToken({
      formData: data,
    })
    localStorage.setItem("access_token", response.access_token)
    if (response.refresh_token) {
      localStorage.setItem("refresh_token", response.refresh_token)
    }
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      // 以门店为主体: 门店管理员直达本店工作台, 总部落门店总览卡片墙
      try {
        // ensureQueryData 会写入 ["currentUser"] 缓存, 侧边栏/守卫直接复用
        const me = await qc.ensureQueryData(currentUserQueryOptions())
        if (me.actor_type === "staff" && me.store_id) {
          navigate({ to: "/stores/$storeId", params: { storeId: me.store_id } })
          return
        }
      } catch {
        // whoami 失败不阻塞登录, 落默认入口
      }
      navigate({ to: "/stores" })
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
