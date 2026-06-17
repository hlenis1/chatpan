import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'

const PORT = process.env.PORT ?? 3008

// --- Menú centralizado ---
const menu = {
  aliñado: [
    { id: 7, nombre: "Pan de 500", precio: 500, gramos: 40 },
    { id: 8, nombre: "Pan de 2000", precio: 2000, gramos: 160 },
    { id: 9, nombre: "Pan jamón y queso", precio: 3000, gramos: 160 },
    { id: 10, nombre: "Pan de 5000", precio: 5000, gramos: 280 },
    { id: 11, nombre: "Pan agridulce 5000", precio: 5000, gramos: 280 },
    { id: 12, nombre: "Pan baguette", precio: 7000, gramos: 400 },
  ],
  dulce: [
    { id: 13, nombre: "Pan dulce 500", precio: 500, gramos: 50 },
    { id: 14, nombre: "Roscón de arequipe", precio: 2500, gramos: 100 },
    { id: 15, nombre: "Roscón de guayaba", precio: 2500, gramos: 100 },
    { id: 16, nombre: "Pan hawaiano", precio: 4000 },
    { id: 17, nombre: "Pan caña", precio: 5000 },
  ],
  bebidas: [],
  pandebono: [],
  tortas: []
}

// --- Funciones dinámicas ---
function mostrarCategorias(menuObj: any) {
  const categorias = Object.keys(menuObj)
  const opciones = categorias.map((cat, idx) =>
    `👉 ${idx + 1} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`
  ).join('\n')

  return [
    'Este es nuestro menú principal:',
    opciones
  ].join('\n')
}

function mostrarMenu(categoria: string, productos: any[]) {
  if (!productos.length) {
    return `⚠️ No tenemos productos en la categoría ${categoria}`
  }
  const titulo = `📋 Menú de ${categoria}:`
  const opciones = productos.map(p =>
    `👉 ${p.id} ${p.nombre} - ${p.precio} pesos${p.gramos ? ` (${p.gramos}g)` : ""}`
  ).join('\n')

  return [titulo, opciones].join('\n')
}

function agregarAlCarrito(state: any, producto: any, cantidad: number) {
  const carrito = state.getMyState().carrito || []
  carrito.push({ ...producto, cantidad })
  state.update({ carrito })
}

function generarFlujosProductos(productos: any[]) {
  return productos.map(p =>
    addKeyword<Provider, Database>([String(p.id), p.nombre.toLowerCase()])
      .addAnswer(`🙌 Seleccionaste ${p.nombre} (${p.precio} pesos${p.gramos ? `, ${p.gramos}g` : ""})`)
      .addAnswer("¿Cuántas unidades deseas?", { capture: true },
        async (ctx, { flowDynamic, state }) => {
          const cantidad = parseInt(ctx.body.trim(), 10)
          if (isNaN(cantidad) || cantidad < 1) {
            await flowDynamic("⚠️ Ingresa un número válido")
            return
          }
          agregarAlCarrito(state, p, cantidad)
          await flowDynamic(`✅ Agregaste ${cantidad} ${p.nombre} al carrito`)
          await flowDynamic("👉 Puedes seguir eligiendo más productos o escribir 'pago' para finalizar tu pedido")
        }
      )
  )
}

// --- Flujos principales ---
const welcomeFlow = addKeyword<Provider, Database>(['hi','hello','hola'])
  .addAnswer(`🙌 Bienvenido a la panadería Las Flores 💬`)
  .addAnswer(mostrarCategorias(menu), { delay: 800 })

const aliñadoFlow = addKeyword<Provider, Database>(['pan aliñado','aliñado','1'])
  .addAnswer(mostrarMenu("Pan aliñado", menu.aliñado), { delay: 800 })

const panDulceFlow = addKeyword<Provider, Database>(['pan dulce','dulce','2'])
  .addAnswer(mostrarMenu("Pan dulce", menu.dulce), { delay: 800 })

// --- Flujos individuales generados automáticamente ---
const flujosAliñado = generarFlujosProductos(menu.aliñado)
const flujosDulce   = generarFlujosProductos(menu.dulce)

// --- Flujo de pago con carrito ---
const costoFlow = addKeyword(['pago'])
  .addAnswer("📦 Resumen de tu pedido:", null,
    async (_, { flowDynamic, state }) => {
      const myState = state.getMyState()
      const carrito = myState.carrito || []
      if (carrito.length === 0) {
        await flowDynamic("⚠️ No tienes productos en el carrito")
        return
      }

      const resumen = carrito.map(item =>
        `- ${item.cantidad} x ${item.nombre} (${item.precio} pesos)`
      ).join('\n')

      const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0)

      await flowDynamic(`${resumen}\n\n💰 Total: ${total} pesos`)
      await state.update({ total, enPago: true })   // 🔑 Marcamos que está en flujo de pago

      await flowDynamic("📍 Escribe tu dirección para continuar")
    }
  )
  .addAnswer("¿Cuál es tu dirección?", { capture: true, onlyIf: (_, { state }) => state.getMyState().enPago },
    async (ctx, { flowDynamic, state }) => {
      await state.update({ direccion: ctx.body })
      await flowDynamic("✅ Dirección registrada")
    }
  )
  .addAnswer("¿Cuál es tu nombre?", { capture: true, onlyIf: (_, { state }) => state.getMyState().enPago },
    async (ctx, { flowDynamic, state }) => {
      if (/^\d+$/.test(ctx.body)) {
        await flowDynamic("⚠️ Ingresa un nombre válido (no números)")
        return
      }
      await state.update({ nombre: ctx.body })
      await flowDynamic(`🙌 Tu nombre es: ${ctx.body}`)
    }
  )
  .addAnswer("¿Cuál es tu número de celular?", { capture: true, onlyIf: (_, { state }) => state.getMyState().enPago },
    async (ctx, { flowDynamic, state }) => {
      const celular = ctx.body.trim()
      if (!/^\d{10}$/.test(celular)) {
        await flowDynamic("⚠️ Ingresa un número de celular válido (10 dígitos)")
        return
      }
      await state.update({ celular, enPago: false }) // 🔑 Al terminar, liberamos el estado
      await flowDynamic("📱 Número de celular registrado")
    }
  )
  .addAnswer("💳 ¿Vas a pagar en efectivo o con Nequi al número 3196946020?\n👉 También puedes escribir 'asesor' para ser atendido por un humano")

// --- Flujos de pago ---
const pagoEfectivoFlow = addKeyword(['efectivo'])
  .addAnswer("💵 Has elegido pagar en efectivo. ✅ Pedido confirmado",
    null,
    async (_, { flowDynamic, state }) => {
      const myState = state.getMyState()
      await flowDynamic(`📍 El administrador ya recibió tu pedido con pago en efectivo. Total: ${myState.total} pesos. Recuerda tener el dinero listo al momento de la entrega.`)
    }
  )

const pagoNequiFlow = addKeyword(['nequi'])
  .addAnswer("📲 Has elegido pagar con Nequi. ✅ Pedido confirmado",
    null,
    async (_, { flowDynamic, state }) => {
      const myState = state.getMyState()
      await flowDynamic(`📍 El administrador ya recibió tu pedido con pago por Nequi. Total: ${myState.total} pesos. Realiza la transferencia al número 3196946020 indicando tu nombre como referencia.`)
    }
  )

// --- Flujo asesor humano ---
const asesorFlow = addKeyword(['asesor','humano'])
  .addAnswer("👩‍💼 Te estamos transfiriendo a un asesor humano.")
  .addAnswer("👉 Puedes escribir directamente al número [3194331042](tel:3194331042) o esperar en este chat a que un humano te atienda.")

// --- Main ---
const main = async () => {
  const adapterFlow = createFlow([
    welcomeFlow,
    aliñadoFlow,
    panDulceFlow,
    ...flujosAliñado,
    ...flujosDulce,
    costoFlow,
    pagoEfectivoFlow,
    pagoNequiFlow,
    asesorFlow
  ])

  const adapterProvider = createProvider(Provider, { version: [2, 3000, 1035824857] })
  const adapterDB = new Database()



  const { httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  })
  httpServer(+PORT)
}

main()