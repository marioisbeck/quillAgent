import webpush, { type PushSubscription } from 'web-push';

type ApprovalNotificationInput = {
  id: string;
  connector: string;
  summary: string;
  title?: string;
  body?: string;
};

export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  subscription: PushSubscription;
};

const pushConfigured = () =>
  Boolean(
    process.env.LOOPKIND_VAPID_PUBLIC_KEY &&
      process.env.LOOPKIND_VAPID_PRIVATE_KEY &&
      process.env.LOOPKIND_VAPID_SUBJECT,
  );

const configureWebPush = () => {
  if (!pushConfigured()) {
    return false;
  }

  webpush.setVapidDetails(
    process.env.LOOPKIND_VAPID_SUBJECT as string,
    process.env.LOOPKIND_VAPID_PUBLIC_KEY as string,
    process.env.LOOPKIND_VAPID_PRIVATE_KEY as string,
  );

  return true;
};

const buildPayload = (approval: ApprovalNotificationInput) =>
  JSON.stringify({
    title: approval.title ?? `New ${approval.connector} approval`,
    body: approval.body ?? approval.summary,
    url: '/',
    tag: `approval:${approval.id}`,
    approvalId: approval.id,
    connector: approval.connector,
  });

export const getLoopkindPushPublicKey = (): string | null =>
  process.env.LOOPKIND_VAPID_PUBLIC_KEY?.trim() || null;

export const canSendLoopkindPush = (): boolean => pushConfigured();

export const sendLoopkindPushNotifications = async (
  subscriptions: StoredPushSubscription[],
  approval: ApprovalNotificationInput,
): Promise<{
  deliveredIds: string[];
  expiredIds: string[];
  failed: Array<{ id: string; error: string }>;
}> => {
  if (!configureWebPush() || subscriptions.length === 0) {
    return {
      deliveredIds: [],
      expiredIds: [],
      failed: [],
    };
  }

  const payload = buildPayload(approval);
  const deliveredIds: string[] = [];
  const expiredIds: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const item of subscriptions) {
    try {
      await webpush.sendNotification(item.subscription, payload, {
        TTL: 60,
        urgency: 'high',
      });
      deliveredIds.push(item.id);
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;
      const message =
        error instanceof Error ? error.message : 'Unknown push delivery failure';
      if (statusCode === 404 || statusCode === 410) {
        expiredIds.push(item.id);
        continue;
      }
      failed.push({ id: item.id, error: message });
    }
  }

  return {
    deliveredIds,
    expiredIds,
    failed,
  };
};
