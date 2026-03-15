/**
 * Dados da sua empresa para notas e impressões.
 * Edite os valores abaixo; eles saem nos fechamentos (cliente) e no comprovante de venda.
 * Instruções completas: veja DADOS_EMPRESA.md na raiz do projeto Financial Control System.
 */
export const empresa = {
  /** Nome ou razão social (cabeçalho das notas) */
  nome: "JOAO PEDRO DOS SANTOS MARINOTO ME",
  /** Nome fantasia (opcional) */
  nomeFantasia: "S M Decor",
  /** CNPJ (deixe "" se usar CPF) */
  cnpj: "61.578.303/0001-01",
  /** CPF (para MEI/autônomo; deixe "" se usar CNPJ) */
  cpf: "",
  /** Inscrição estadual */
  ie: "191053530110",
  /** Logradouro */
  endereco: "Rua José Barbosa",
  /** Número */
  numero: "5876",
  /** Complemento */
  complemento: "",
  /** Bairro */
  bairro: "Centro",
  /** Cidade */
  cidade: "Auriflama",
  /** UF (ex: SP) */
  estado: "SP",
  /** CEP */
  cep: "15350-007",
  /** Telefone */
  telefone: "(17) 99178-1988",
  /** E-mail */
  email: "santosmarinotodecor@gmail.com",
  /** Site */
  site: "",
};

/** Uma linha de endereço formatada (rua, número, bairro). */
export function empresaEnderecoLinha(): string {
  const { endereco, numero, complemento, bairro, cidade, estado, cep } = empresa;
  const partes = [endereco, numero, complemento, bairro].filter(Boolean);
  const linha = partes.join(", ");
  const cidadeEstado = [cidade, estado].filter(Boolean).join("/");
  const cepStr = cep ? ` — CEP ${cep}` : "";
  return [linha, cidadeEstado, cepStr].filter(Boolean).join(cepStr ? " " : " — ");
}

/** Documento (CNPJ ou CPF) formatado para exibição. */
export function empresaDocumento(): string {
  if (empresa.cnpj) return `CNPJ: ${empresa.cnpj}`;
  if (empresa.cpf) return `CPF: ${empresa.cpf}`;
  return "";
}
