import { agentConfigSchema, type AgentConfig } from "@cergo/contracts";

/** Configuración de ejemplo: Hotel Casa del Lago (ficticio, para demos y staging). */
export function casaDelLagoConfig(): AgentConfig {
  return agentConfigSchema.parse({
    hotel: {
      name: "Hotel Casa del Lago",
      city: "San Carlos de Bariloche",
      address: "Av. Costanera 1450, San Carlos de Bariloche, Río Negro",
      phone: "+54 294 400-0000",
      email: "reservas@casadellago.example",
      website: "",
      checkIn: "15:00",
      checkOut: "11:00",
    },
    greeting: "Hola, buenas, {{hotel_nombre}}, te habla el asistente de recepción. ¿En qué te puedo ayudar?",
    personality: "Cálido y tranquilo, como alguien de recepción que conoce Bariloche. Frases cortas.",
    objectives:
      "Cotizar estadías, dejar reservas cargadas para que recepción las confirme y responder las preguntas frecuentes. Ofrecé traslados y excursiones cuando venga al caso.",
    handoffRules: "Eventos y grupos de más de 4 habitaciones los gestiona recepción.",
    maxGroupRooms: 4,
    policies: [
      "Desayuno buffet incluido en todas las tarifas, de 7:30 a 10:30.",
      "Para confirmar se pide una seña del 30% por link de pago; el saldo se paga en el check-in.",
      "Cancelación sin cargo hasta 7 días antes de la llegada (temporada alta: 15 días). Después se retiene la seña. No-show: se cobra la primera noche.",
      "Estadía mínima de 3 noches en temporada alta y fines de semana largos.",
      "Menores de 3 años sin cargo en la cama de los padres; cuna sin cargo a pedido. Cama adicional USD 35 por noche (Triple, Suite y Cabaña).",
      "Early check-in desde las 10:00 y late check-out hasta las 15:00, sujetos a disponibilidad, con cargo del 50% de una noche.",
      "Mascotas: perros de hasta 15 kg solo en las Cabañas Familiares, USD 20 por estadía.",
      "Se puede pagar en pesos al tipo de cambio del día. Hay factura A y B.",
    ].join("\n"),
    rooms: [
      { name: "Doble Estándar", capacity: "2 adultos", rateUsd: 110, highSeasonRateUsd: 150, description: "Vista al jardín." },
      { name: "Doble Superior", capacity: "2 adultos", rateUsd: 140, highSeasonRateUsd: 190, description: "Vista al lago. Hay una adaptada en planta baja." },
      { name: "Triple Superior", capacity: "3 personas (3 adultos o 2 + 1 menor)", rateUsd: 170, highSeasonRateUsd: 230, description: "Vista al lago." },
      { name: "Suite Lago", capacity: "3 personas (2 adultos + 1 menor)", rateUsd: 220, highSeasonRateUsd: 300, description: "Con hidromasaje y aire acondicionado." },
      { name: "Cabaña Familiar", capacity: "hasta 5 personas", rateUsd: 260, highSeasonRateUsd: 350, description: "Dos ambientes con kitchenette. Acepta mascotas." },
    ],
    highSeason: [
      { from: "07-01", to: "08-31" },
      { from: "12-20", to: "02-28" },
    ],
    faq: [
      { question: "¿Tienen estacionamiento?", answer: "Sí, cubierto y gratis, 12 lugares por orden de llegada. Hay 2 cargadores para autos eléctricos." },
      { question: "¿Tienen Wi-Fi?", answer: "Sí, gratis en todo el hotel." },
      { question: "¿Tienen traslado desde el aeropuerto?", answer: "Sí, 25 minutos, USD 35 por trayecto hasta 4 personas, con reserva previa de 24 horas." },
      { question: "¿Qué horarios tienen el spa y la piscina?", answer: "De 9 a 21. La piscina climatizada está incluida; los masajes son con turno previo." },
      { question: "¿Tienen restaurante?", answer: "Sí, La Orilla: cena de 20 a 23, de martes a domingo. Se recomienda reservar." },
      { question: "¿Puedo dejar el equipaje antes del check-in o después del check-out?", answer: "Sí, sin cargo, en recepción." },
      { question: "¿Tienen opciones sin TACC, vegetarianas o veganas?", answer: "Sí, en el desayuno y en el restaurante; conviene avisar al reservar." },
      { question: "¿Aceptan efectivo?", answer: "Sí, pesos o dólares en el check-in." },
      { question: "¿Cómo llego desde el centro?", answer: "Son 10 minutos en auto por la Costanera hacia el oeste. Desde la terminal, 15 minutos en taxi o remis." },
      { question: "¿Organizan excursiones?", answer: "Sí, recepción reserva Cerro Catedral, Circuito Chico y navegación a Isla Victoria." },
    ],
    receptionHours: {
      "0": [{ from: "00:00", to: "23:59" }],
      "1": [{ from: "00:00", to: "23:59" }],
      "2": [{ from: "00:00", to: "23:59" }],
      "3": [{ from: "00:00", to: "23:59" }],
      "4": [{ from: "00:00", to: "23:59" }],
      "5": [{ from: "00:00", to: "23:59" }],
      "6": [{ from: "00:00", to: "23:59" }],
    },
    languages: ["es", "en", "pt"],
    voiceId: null,
    advanced: "",
  });
}
