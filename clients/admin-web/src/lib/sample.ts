// Datos de ejemplo para llenar formularios rápido durante la demostración.

const FIRST = ['Valentina', 'Santiago', 'Mariana', 'Andrés', 'Camila', 'Julián', 'Daniela', 'Sebastián', 'Laura', 'Felipe', 'Sara', 'Mateo', 'Paula', 'Nicolás', 'Juliana', 'Esteban'];
const LAST = ['Rojas', 'Gómez', 'Vargas', 'Castro', 'Muñoz', 'Ortiz', 'Herrera', 'Medina', 'Cardona', 'Ospina', 'Quintero', 'Salazar', 'Perdomo', 'Trujillo', 'Polanía', 'Cuéllar'];

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const digits = (count: number) => Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join('');

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function sampleMember() {
  const first = pick(FIRST);
  const last = pick(LAST);
  const second = pick(LAST.filter((name) => name !== last));
  return {
    name: `${first} ${last} ${second}`,
    document: `10${digits(8)}`,
    phone: `3${pick(['00', '01', '10', '12', '15', '20', '22', '50'])} ${digits(3)} ${digits(4)}`,
    email: `${slug(first)}.${slug(last)}@correo.com`,
  };
}
