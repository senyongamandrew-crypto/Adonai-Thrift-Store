import apiClient from './api'

export async function payWithMobileMoney(amount: number, phone: string) {
  return apiClient.initiateMobileMoneyPayment(amount, phone)
}

export async function verifyPayment(ref: string) {
  return apiClient.verifyMobileMoneyPayment(ref)
}
