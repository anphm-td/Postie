import { registerSystemIpc } from './system.js'
import { registerUsersIpc } from './users.js'
import { registerProductsIpc } from './products.js'
import { registerOrdersIpc } from './orders.js'
import { registerShiftsIpc } from './shifts.js'
import { registerCustomersIpc } from './customers.js'
import { registerPaymentMethodsIpc } from './payment-methods.js'
import { registerPromotionsIpc } from './promotions.js'
import { registerCategoriesIpc } from './categories.js'
import { registerSuppliersIpc } from './suppliers.js'
import { registerPurchasesIpc } from './purchases.js'
import { registerStocktakesIpc } from './stocktakes.js'
import { registerReturnsIpc } from './returns.js'
import { registerReportsIpc } from './reports.js'

export function registerIpc(): void {
  registerSystemIpc()
  registerUsersIpc()
  registerProductsIpc()
  registerOrdersIpc()
  registerShiftsIpc()
  registerCustomersIpc()
  registerPaymentMethodsIpc()
  registerPromotionsIpc()
  registerCategoriesIpc()
  registerSuppliersIpc()
  registerPurchasesIpc()
  registerStocktakesIpc()
  registerReturnsIpc()
  registerReportsIpc()
}
