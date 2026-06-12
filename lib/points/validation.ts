/**
 * lib/points/validation.ts
 * 积分参数校验
 */
import { required, optional, toInt } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parseAwardPoints(body: any) {
  return {
    userId: validateObjectId(body?.userId, 'userId'),
    amount: toInt(body?.amount, 'amount'),
    reason: required(body?.reason, '原因'),
  }
}

export function parseShopItemCreate(body: any) {
  return {
    name: required(body?.name, '商品名称'),
    description: optional(body?.description),
    cost: toInt(body?.cost, '积分', 1),
    stock: toInt(body?.stock, '库存', 0),
  }
}

export function parseExchange(body: any) {
  return {
    itemId: validateObjectId(body?.itemId, 'itemId'),
    quantity: toInt(body?.quantity, '数量', 1),
  }
}
