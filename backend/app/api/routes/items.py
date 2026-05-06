"""(模板遗留) items 示例路由 - 已废弃, 业务以 profiles/matches/favorites/contacts 替代.

保留空文件防止旧引用报错; 实际不挂任何路由.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/items", tags=["items"], deprecated=True)
