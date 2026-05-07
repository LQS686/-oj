import { apiClient } from './base';

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  type: string;
}

interface NotificationResponse {
  notifications: Notification[];
  unreadCount: number;
  total: number;
}

export const notificationApi = {
  async getNotifications(limit?: number, offset?: number): Promise<NotificationResponse> {
    return apiClient.get<NotificationResponse>('/notifications', { limit, offset });
  },

  async getNotificationById(id: string): Promise<Notification> {
    return apiClient.get<Notification>(`/notifications/${id}`);
  },

  async markAsRead(id: string): Promise<void> {
    return apiClient.put(`/notifications/${id}`);
  },

  async markAllAsRead(): Promise<void> {
    return apiClient.put('/notifications/mark-all-read');
  },
};
