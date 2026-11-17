# GraphQL Gateway

Gateway de solo lectura para exponer `member(id: Int!): MemberOverview` sobre el modelo mantenido por Consolidated Queries Service. No define mutaciones ni lógica transaccional. El contrato está en `contracts/graphql/schema.graphqls`.
