import { createFileRoute } from "@tanstack/react-router"

import { ActivityFeedList } from "@/components/Activities/ActivityFeedList"

export const Route = createFileRoute("/_layout/activities")({
  component: ActivityFeedList,
  head: () => ({
    meta: [{ title: "行为动态 - 乾缘后台" }],
  }),
})
