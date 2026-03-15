# Dados da sua empresa para notas e impressões

Os dados da empresa saem nos **fechamentos** (Cliente → Fechamento selecionadas) e podem sair nos **comprovantes de venda**.  
Tudo é configurado em **um único arquivo**:

**`src/app/data/empresa.ts`**

---

## Como preencher

1. Abra o arquivo **`Financial Control System/src/app/data/empresa.ts`** no seu editor.
2. Substitua os valores entre aspas pelos dados reais da sua empresa.
3. Deixe em branco (`""`) os campos que não quiser exibir nas notas.
4. Salve o arquivo. Na próxima impressão, os dados atualizados já serão usados.

---

## Campos disponíveis

| Campo          | Exemplo            | Onde aparece nas notas                    |
|----------------|--------------------|-------------------------------------------|
| **nome**       | "S M Decor Ltda"   | Nome principal no cabeçalho               |
| **nomeFantasia** | "S M Decor"      | Nome fantasia (opcional)                  |
| **cnpj**       | "12.345.678/0001-90" | Texto "CNPJ: ..." no cabeçalho         |
| **cpf**        | "123.456.789-00"   | Use se não tiver CNPJ (MEI/autônomo)      |
| **ie**         | "123.456.789"      | Inscrição estadual (se tiver)             |
| **endereco**   | "Rua das Flores"   | Logradouro                                |
| **numero**     | "100"              | Número                                    |
| **complemento**| "Sala 2"           | Complemento                               |
| **bairro**     | "Centro"           | Bairro                                    |
| **cidade**     | "São Paulo"        | Cidade                                    |
| **estado**     | "SP"               | UF (2 letras)                              |
| **cep**        | "01234-567"        | CEP                                       |
| **telefone**   | "(11) 99999-9999"  | Telefone (contato no rodapé)              |
| **email**      | "contato@smdecor.com" | E-mail (contato no rodapé)             |
| **site**       | "www.smdecor.com"  | Site (opcional)                           |

O endereço é montado automaticamente em uma linha: *endereco, numero, complemento, bairro — cidade/estado — CEP*.

---

## Exemplo preenchido

```ts
export const empresa = {
  nome: "S M Decor Comércio de Móveis Ltda",
  nomeFantasia: "S M Decor",
  cnpj: "12.345.678/0001-90",
  cpf: "",
  ie: "123.456.789",
  endereco: "Rua das Flores",
  numero: "100",
  complemento: "Sala 2",
  bairro: "Centro",
  cidade: "São Paulo",
  estado: "SP",
  cep: "01234-567",
  telefone: "(11) 99999-9999",
  email: "contato@smdecor.com",
  site: "www.smdecor.com",
};
```

---

## Onde esses dados aparecem

- **Fechamento para o cliente** (Cliente → selecionar vendas → Imprimir fechamento): cabeçalho com nome da empresa, CNPJ/CPF, endereço e contato.
- **Comprovante de venda** (Venda → detalhe da venda → Imprimir venda): rodapé com nome da empresa e data de impressão.

Só é exibido o que estiver preenchido; campos vazios não aparecem na nota.
