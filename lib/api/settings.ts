import { apiClient } from './base';
import type { SystemSettings } from '@/lib/settings-defaults';

export type PublicSettings = Pick<
  SystemSettings,
  'siteName' | 'siteDescription' | 'allowRegistration' | 'defaultLanguage'
> & {
  /** 空库：允许创建首个管理员，即使 allowRegistration=false */
  needsBootstrap?: boolean
}

export const settingsApi = {
  async getPublicSettings(): Promise<PublicSettings> {
    return apiClient.get('/settings/public')
  },
}
