import { Github, Linkedin, Twitter } from "lucide-react"

const socialLinks = [
  {
    icon: Github,
    href: "https://github.com/fastapi/fastapi",
    label: "GitHub",
  },
  { icon: Twitter, href: "https://x.com/fastapi", label: "X" },
  {
    icon: Linkedin,
    href: "https://linkedin.com/company/fastapi",
    label: "LinkedIn",
  },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t py-4 px-6">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="text-muted-foreground text-sm flex gap-4">
          <span>德州乾瑞婚恋服务有限公司 © {currentYear}</span>
          <span>统一社会信用代码：91371428MAKCPBR96B</span>
        </div>
        <div className="flex items-center gap-4">
          {socialLinks.map(({ icon: Icon, href, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
