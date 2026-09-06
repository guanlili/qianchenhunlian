import warnings
from typing import Annotated, Any, Literal

from pydantic import (
    AnyUrl,
    BeforeValidator,
    EmailStr,
    HttpUrl,
    PostgresDsn,
    computed_field,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Use top level .env file (one level above ./backend/)
        env_file="../.env",
        env_ignore_empty=True,
        extra="ignore",
    )
    API_V1_STR: str = "/api/v1"
    # 必须在 .env 显式配置一个强随机值; 留默认值生产环境会启动报错 (见下方校验).
    # 不再用 secrets.token_urlsafe(32) 做默认: 那样多 worker/重启会各自随机, token 互不认.
    SECRET_KEY: str = "changethis"
    # 60 分钟 * 24 小时 * 2 天 = 2 天 (短一些, 降低 token 泄露窗口)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 2
    # Refresh token 有效期 7 天; access 过期后用它在后台静默续期 (admin)。
    # 小程序不接 refresh, access 过期靠静默 wx.login 重登。
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_HOST: str = "http://localhost:5173"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"
    # 可信反向代理 IP (逗号分隔). 生产部署在 traefik 后时填 traefik 容器 IP,
    # 用于从 X-Forwarded-For 链中剥离可信代理、还原真实客户端 IP (限流防爆破).
    # 留空则不信任 XFF, 限流按直连 IP 聚合 (不会被伪造头绕过, 但粒度变粗).
    TRUSTED_PROXIES: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def trusted_proxies(self) -> set[str]:
        return {p.strip() for p in self.TRUSTED_PROXIES.split(",") if p.strip()}

    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST
        ]

    PROJECT_NAME: str
    SENTRY_DSN: HttpUrl | None = None
    POSTGRES_SERVER: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: str | None = None

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 1

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    EMAIL_TEST_USER: EmailStr = "test@example.com"
    FIRST_SUPERUSER: EmailStr
    FIRST_SUPERUSER_PASSWORD: str

    # --- 微信开放平台 (小程序登录) ---
    # 未配置时 /wechat/login 会返回 503; 本地开发可只跑 admin 这条线
    WECHAT_APP_ID: str = ""
    WECHAT_APP_SECRET: str = ""

    # --- 微信支付 v3 · 小程序 JSAPI (docs/13 P3 线上缴费) ---
    # 七项全配 + SiteSetting membership.plans 的 pay_enabled=true 才真正开启线上购买
    # (见 core/membership.is_pay_online); 任一缺失时小程序只展示线下门店缴费引导,
    # 下单接口 503。密钥/证书均为敏感信息, 只允许走环境变量注入, 严禁入库。
    WECHAT_PAY_MCH_ID: str = ""  # 商户号
    WECHAT_PAY_CERT_SERIAL_NO: str = ""  # 商户 API 证书序列号 (请求签名用)
    WECHAT_PAY_PRIVATE_KEY: str = ""  # 商户私钥 PEM 文本 (\n 转义亦可)
    WECHAT_PAY_APIV3_KEY: str = ""  # APIv3 密钥 (32 位, 回调 AES-GCM 解密用)
    WECHAT_PAY_PUBLIC_KEY_ID: str = (
        ""  # 微信支付公钥 ID (公钥模式, 回调验签比对 serial)
    )
    WECHAT_PAY_PUBLIC_KEY: str = ""  # 微信支付公钥 PEM 文本 (回调验签用)
    WECHAT_PAY_NOTIFY_URL: str = ""  # 回调地址, 须 https 公网可达

    # --- 阿里云 OSS (二期图片存储) ---
    # 三项 (AK/SK/Bucket) 任一为空即视为未启用, 自动退回本地磁盘 (一期行为),
    # 本地开发零依赖. AK 用 RAM 子账号, 只授本 Bucket 的 Put/Get/Delete 权限.
    OSS_ACCESS_KEY_ID: str = ""
    OSS_ACCESS_KEY_SECRET: str = ""
    OSS_BUCKET: str = ""
    # 上传走内网 endpoint (ECS 同地域免流量费/低延迟), 签名 URL 用公网 endpoint.
    # 公网 endpoint 带 https:// 前缀: 签名 URL 会继承该协议, 小程序/https 页面要求图片链接为 https.
    OSS_INTERNAL_ENDPOINT: str = "https://oss-cn-beijing-internal.aliyuncs.com"
    OSS_PUBLIC_ENDPOINT: str = "https://oss-cn-beijing.aliyuncs.com"
    # 私有读签名 URL 有效期 (秒), 默认 15 分钟.
    # 取舍: 有效期越长, 链接被截图/转发出去后被长期白嫖的窗口越大; 越短则
    # 客户端需要更频繁地回源重签 (列表每次渲染都会拿新 URL, 重签成本只是
    # 一次本地 HMAC 计算, 可忽略)。15 分钟覆盖一次完整浏览会话, 兼顾两者。
    OSS_SIGNED_URL_EXPIRE_SECONDS: int = 15 * 60

    # 常见弱默认值 (含模板占位符与运维图省事的口令). 命中即视为"未真正配置".
    _WEAK_SECRETS = frozenset(
        {
            "changethis",
            "changeme",
            "changeme123",
            "password",
            "passw0rd",
            "123456",
            "12345678",
            "admin",
            "admin123",
            "secret",
            "test",
            "",
        }
    )

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value is not None and value.strip().lower() in self._WEAK_SECRETS:
            message = (
                f"{var_name} 仍是弱默认值/占位符, 出于安全请改成强随机值 "
                "(本地仅告警, 部署环境会拒绝启动)."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )

        return self

    @model_validator(mode="after")
    def _warn_missing_sentry_dsn(self) -> Self:
        """production 未配 SENTRY_DSN 时打 UserWarning (模式同弱密码告警).

        只告警不 raise —— 现有部署可能尚未接入 Sentry, 直接拒绝启动会破坏它们;
        但线上无异常上报会显著拖慢排障, 值得在启动日志里提示一次。
        """
        if self.ENVIRONMENT == "production" and not self.SENTRY_DSN:
            warnings.warn(
                "生产环境未配置 SENTRY_DSN, 线上异常将无法上报 Sentry, "
                "排障能力受损 (仅告警, 不阻断启动).",
                stacklevel=1,
            )
        return self


settings = Settings()  # type: ignore
