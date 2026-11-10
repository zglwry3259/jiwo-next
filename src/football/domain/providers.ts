import {
  siAkamai,
  siAlibabacloud,
  siAlmalinux,
  siAlpinelinux,
  siArchlinux,
  siCentos,
  siCloudflare,
  siContabo,
  siDebian,
  siDigitalocean,
  siFedora,
  siFreebsd,
  siGentoo,
  siGodaddy,
  siGooglecloud,
  siHetzner,
  siHostinger,
  siHuawei,
  siIonos,
  siKalilinux,
  siLinux,
  siMacos,
  siNamecheap,
  siNixos,
  siOpensuse,
  siOpenwrt,
  siOvh,
  siProxmox,
  siRedhat,
  siRockylinux,
  siScaleway,
  siUbuntu,
  siUpcloud,
  siVultr,
} from 'simple-icons'
import akileImg from '../assets/providers/akile.webp'
import bagevmImg from '../assets/providers/bagevm.webp'
import cloudconeImg from '../assets/providers/cloudcone.webp'
import vmissImg from '../assets/providers/vmiss.svg'

/** Simple Icons（CC0）的品牌路径：24x24，用品牌色填充。 */
export interface BrandIcon {
  path: string
  hex: string
}
export interface Badge {
  name: string
  icon?: BrandIcon
  /** 没有 Simple Icons 图标时用文字标记。 */
  short?: string
}
export interface Provider extends Badge {
  id: string
  /** Simple Icons 缺失时随主题打包的 logo。 */
  image?: string
}
const mark = (icon: { path: string; hex: string }): BrandIcon => ({ path: icon.path, hex: icon.hex })

/** 节点设置里可选的服务商；`custom`（自填名称与 LOGO）由配置层处理。 */
export const providers: Provider[] = [
  { id: 'aws', name: 'AWS', short: 'AWS' },
  { id: 'aliyun', name: '阿里云', icon: mark(siAlibabacloud) },
  { id: 'tencent', name: '腾讯云', short: '腾讯云' },
  { id: 'huawei', name: '华为云', icon: mark(siHuawei) },
  { id: 'googlecloud', name: 'Google Cloud', icon: mark(siGooglecloud) },
  { id: 'azure', name: 'Azure', short: 'Azure' },
  { id: 'oracle', name: 'Oracle Cloud', short: 'Oracle' },
  { id: 'digitalocean', name: 'DigitalOcean', icon: mark(siDigitalocean) },
  { id: 'vultr', name: 'Vultr', icon: mark(siVultr) },
  { id: 'linode', name: 'Linode / Akamai', icon: mark(siAkamai) },
  { id: 'hetzner', name: 'Hetzner', icon: mark(siHetzner) },
  { id: 'ovh', name: 'OVHcloud', icon: mark(siOvh) },
  { id: 'cloudflare', name: 'Cloudflare', icon: mark(siCloudflare) },
  { id: 'scaleway', name: 'Scaleway', icon: mark(siScaleway) },
  { id: 'contabo', name: 'Contabo', icon: mark(siContabo) },
  { id: 'upcloud', name: 'UpCloud', icon: mark(siUpcloud) },
  { id: 'ionos', name: 'IONOS', icon: mark(siIonos) },
  { id: 'hostinger', name: 'Hostinger', icon: mark(siHostinger) },
  { id: 'godaddy', name: 'GoDaddy', icon: mark(siGodaddy) },
  { id: 'namecheap', name: 'Namecheap', icon: mark(siNamecheap) },
  { id: 'racknerd', name: 'RackNerd', short: 'RackNerd' },
  { id: 'bandwagon', name: '搬瓦工', short: '搬瓦工' },
  { id: 'dmit', name: 'DMIT', short: 'DMIT' },
  { id: 'cloudcone', name: 'CloudCone', image: cloudconeImg },
  { id: 'bagevm', name: 'BageVM', image: bagevmImg },
  { id: 'vmiss', name: 'VMISS', image: vmissImg },
  { id: 'akile', name: 'Akile', image: akileImg },
]
export const providerOf = (id: unknown) => providers.find((p) => p.id === id)

const systems: [RegExp, Badge][] = [
  [/debian/i, { name: 'Debian', icon: mark(siDebian) }],
  [/ubuntu/i, { name: 'Ubuntu', icon: mark(siUbuntu) }],
  [/centos/i, { name: 'CentOS', icon: mark(siCentos) }],
  [/alpine/i, { name: 'Alpine Linux', icon: mark(siAlpinelinux) }],
  [/rocky/i, { name: 'Rocky Linux', icon: mark(siRockylinux) }],
  [/alma/i, { name: 'AlmaLinux', icon: mark(siAlmalinux) }],
  [/fedora/i, { name: 'Fedora', icon: mark(siFedora) }],
  [/\barch\b|archlinux/i, { name: 'Arch Linux', icon: mark(siArchlinux) }],
  [/red ?hat|\brhel\b/i, { name: 'Red Hat', icon: mark(siRedhat) }],
  [/suse/i, { name: 'openSUSE', icon: mark(siOpensuse) }],
  [/freebsd/i, { name: 'FreeBSD', icon: mark(siFreebsd) }],
  [/kali/i, { name: 'Kali Linux', icon: mark(siKalilinux) }],
  [/gentoo/i, { name: 'Gentoo', icon: mark(siGentoo) }],
  [/nixos/i, { name: 'NixOS', icon: mark(siNixos) }],
  [/openwrt/i, { name: 'OpenWrt', icon: mark(siOpenwrt) }],
  [/proxmox/i, { name: 'Proxmox', icon: mark(siProxmox) }],
  [/mac ?os|darwin/i, { name: 'macOS', icon: mark(siMacos) }],
  [/windows/i, { name: 'Windows', short: 'Win' }],
  [/linux/i, { name: 'Linux', icon: mark(siLinux) }],
]
/** Agent 上报的系统名对应的徽章；为空或未知时返回 null。 */
export const osBadge = (os: string): Badge | null => systems.find(([pattern]) => pattern.test(os))?.[1] ?? null
