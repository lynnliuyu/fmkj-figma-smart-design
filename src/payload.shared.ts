import type { Config } from 'payload'
import path from 'path'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { en as adminLanguage } from '@payloadcms/translations/languages/en'
import { fileURLToPath } from 'url'
import { Admins } from './collections/Admins'
import { AiConversations } from './collections/AiConversations'
import { AiCreditLedger } from './collections/AiCreditLedger'
import { AiMessages } from './collections/AiMessages'
import { Brands } from './collections/Brands'
import { Categories } from './collections/Categories'
import { ClientFeedback } from './collections/ClientFeedback'
import { Contracts } from './collections/Contracts'
import { Media } from './collections/Media'
import { Folders } from './collections/Folders'
import { MpSessions } from './collections/MpSessions'
import { Products } from './collections/Products'
import { ProposalTemplates } from './collections/ProposalTemplates'
import { Scenes } from './collections/Scenes'
import { Projects } from './collections/Projects'
import { Quotes } from './collections/Quotes'
import { RedemptionCodes } from './collections/RedemptionCodes'
import { ServiceRecords } from './collections/ServiceRecords'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { WechatAccounts } from './collections/WechatAccounts'
import { AiSettings } from './globals/AiSettings'
import { CompanySettings } from './globals/CompanySettings'
import { MembershipSettings } from './globals/MembershipSettings'
import { PLUGINS } from './plugins'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Figma 托管版（payload.config.ts）和自建服务器版（payload.selfhost.config.ts）共用的配置。
 * 新增集合、全局配置、插件都加在这里，两边自动保持一致。
 * 数据库、存储、密钥这些和运行环境有关的部分不放在这里。
 */
export const sharedConfig = {
  admin: {
    user: Admins.slug,
    constrainWidth: true,
    components: {
      beforeDashboard: ['@/components/admin/ai-model-fetcher#AdminAiQuickBanner'],
    },
    dashboard: {
      widgets: [],
      defaultLayout: [
        { widgetSlug: 'activity', width: 'full' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    fallbackLanguage: 'en',
    supportedLanguages: { en: adminLanguage },
  },
  collections: [
    Admins,
    Users,
    Projects,
    Quotes,
    Contracts,
    ServiceRecords,
    ClientFeedback,
    Products,
    Scenes,
    ProposalTemplates,
    Brands,
    Categories,
    Media,
    Folders,
    Tags,
    AiConversations,
    AiMessages,
    AiCreditLedger,
    RedemptionCodes,
    WechatAccounts,
    MpSessions,
  ],
  globals: [CompanySettings, AiSettings, MembershipSettings],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },
  plugins: [
    mcpPlugin({}),
    // 应用插件的 Payload 扩展（例如 DWG 转户型图），在 src/plugins/index.ts 登记
    ...PLUGINS.flatMap((p) => (p.payload ? [p.payload] : [])),
  ],
} satisfies Partial<Config>
