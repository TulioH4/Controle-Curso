<div align="center">

<img src="docs/banner.png" width="880" alt="Centro de Controle: notas, faltas, provas e tarefas da graduação num só lugar">

Funciona no computador e no celular, offline, com os mesmos dados nos dois.

<a href="https://tulioh4.github.io/centro-de-controle/"><img src="docs/abrir-app.png" height="46" alt="Abrir o app"></a>

[Instalar](#instalar) &nbsp;&nbsp; [Funcionalidades](#funcionalidades) &nbsp;&nbsp; [Seus dados](#seus-dados) &nbsp;&nbsp; [Como funciona](#como-funciona)

<br>

<img src="docs/painel.png" width="900" alt="Painel no tema claro: recado do dia, resumo com aulas, próxima aula, próxima prova e prazos, próximas provas, prazos de laboratório e agenda da semana">

<sub>Captura com um perfil fictício.</sub>

</div>

---

## Instalar

O Centro de Controle é um **PWA**: abre no navegador e pode ser instalado como app, com ícone e janela próprios, sem loja.

| Aparelho | Como instalar |
|---|---|
| **Windows** (Edge ou Chrome) | Abra o [link do app](https://tulioh4.github.io/centro-de-controle/) e clique no ícone de instalar na barra de endereço, ou no botão de download na barra lateral do app. |
| **Android** (Chrome) | Abra o link, toque em **⋮** e depois em **Instalar app**. |

Depois de instalado, entre com a sua conta para ter os mesmos dados em todos os aparelhos, ou escolha **Usar sem conta** para guardar tudo só naquele aparelho.

Atualizações chegam sozinhas: a cada nova versão publicada, o app instalado se atualiza na próxima vez que for aberto com internet.

## Funcionalidades

**Painel**
- Um recado curto do dia: provas de hoje e amanhã, tarefas atrasadas ou vencendo, relatórios perto do prazo e a nota de prova que já deve ter saído
- Resumo do dia: aulas, próxima aula, próxima prova e prazos da semana
- Próximas provas com data, horário e sala; prazos de laboratório em aberto
- Agenda da semana em grade, juntando aulas, provas, entregas e tarefas (no dia de uma prova, a aula da disciplina dá lugar a ela)
- Post-its de lembrete fixados no topo
- Linha do tempo de provas e plano de estudos sugerido para os próximos 7 dias

**Acompanhamento acadêmico**
- **Notas:** notas parciais com peso, meta por disciplina, calculadora de quanto falta na prova final, simulador de IRA e gráficos de desempenho; a nota de uma prova realizada pode ser lançada direto nela, e vai para a aba Notas
- **Faltas:** contador com limite editável por disciplina, aviso quando chega perto do limite, ranking de risco e um botão **Faltei** nas aulas de hoje do painel
- **Histórico** do curso inteiro, separado por semestre, com busca e filtros; para adicionar uma disciplina basta o nome, o semestre e se já passou, está cursando ou ainda vai fazer
- **Mapa de Sucesso:** o currículo organizado semestre a semestre. Em Engenharia de Produção do INATEL (currículo 3.2), com o quadro de pré e co-requisitos e os créditos: previsão de formatura (o que cabe em cada semestre, com o limite de créditos que você escolher), cadeado nas disciplinas que ainda dependem de outras e, no detalhe de cada uma, o que ela exige e o que ela libera. Mostra também o que está em jogo no semestre: em quais disciplinas uma reprovação adia a formatura (aviso que aparece também no card de risco do Painel)
- **Árvore do curso:** o quadro de pré-requisitos desenhado, um período por linha; tocar numa disciplina acende tudo o que ela exige e tudo o que ela libera, com as ligações (aprovada antes, cursada antes, antes ou junto)
- **Horas complementares** e **Laboratório** (turmas e entrega de relatórios)

**Organização**
- Tarefas em lista ou em quadro kanban, com prioridade, categoria, filtros e conclusão com um toque
- Calendário de provas: tocar num dia já abre o formulário com a data
- Provas, tarefas e entregas exportadas para a agenda do celular (arquivo .ics, com aviso na véspera), ou uma prova por vez no Google Agenda
- Grade de horário semanal (no celular, um dia por vez, começando por hoje)
- **Montar a grade do semestre** pelo PDF de horários da faculdade (no formato do Inatel), lido no próprio aparelho: o app mostra as turmas de cada disciplina, avisa dos choques e monta as combinações sem choque, da que usa menos dias no campus para a que usa mais. Ou monta a melhor grade sozinho: o máximo de disciplinas que faltam nos horários em que você pode ter aula, começando pelas dos primeiros períodos. No curso com quadro de requisitos, só entram as disciplinas que os pré-requisitos liberam, primeiro as que seguram a formatura; marcar uma bloqueada avisa que a matrícula recusa, e cada grade mostra em que semestre você se forma com ela
- Timer Pomodoro de 25 ou 50 minutos, com pausa longa a cada 4 rodadas e registro das sessões por disciplina; segue contando com a tela bloqueada ou o app fechado

**Do jeito de um app**
- Funciona offline e sincroniza quando a internet volta
- **Fim de semestre** em 3 passos: a nota final de cada disciplina (já calculada das parciais) vai para o Histórico, você escolhe as disciplinas do próximo semestre e o que zerar (faltas, provas passadas, tarefas concluídas, horário, laboratório). Cada semestre encerrado fica registrado, e o último encerramento pode ser desfeito
- Excluiu sem querer? O aviso traz **Desfazer** por alguns segundos (tarefas, provas, lembretes, relatórios e horas)
- `Ctrl K` adiciona tarefa ou prova de qualquer tela; teclas `1` a `9` trocam de aba; `?` mostra os atalhos
- Atalhos no ícone (clique direito no Windows, toque longo no Android): nova tarefa, provas, tarefas
- Notificações de provas e prazos do dia e do dia seguinte e, no domingo à noite, o resumo da semana
- Tema claro e escuro, no estilo *Liquid Glass*
- Assistente de configuração para novos usuários: a grade de Engenharia de Produção do INATEL é montada com toques (escolha o semestre e ajuste as disciplinas); nos outros cursos a pessoa escreve o nome das disciplinas de cada semestre (o código é criado sozinho), ou importa uma planilha do Excel
- Criar conta já entra direto, sem e-mail de confirmação
- Backup em arquivo e, sem conta, vários perfis no mesmo aparelho

## Seus dados

- **Com conta:** os dados ficam na sua conta (Supabase), protegidos por regras que só permitem a cada usuário ler e gravar os próprios registros. O app trabalha sempre com uma cópia local, então abre na hora e funciona sem internet; as alterações sobem em segundo plano e aparecem nos outros aparelhos em poucos segundos.
- **Cada pessoa, sua conta:** para outra pessoa usar o app no mesmo aparelho, basta sair e entrar com a conta dela.
- **Sem conta:** tudo fica só no navegador daquele aparelho.
- **Backup:** em *Configurações → Backup dos dados*, exporte ou importe um arquivo `.json` com tudo do perfil.
- **Proteção do app:** a versão publicada só executa scripts do próprio app e das bibliotecas que ele usa, cada uma conferida pela impressão digital do arquivo (Content Security Policy e SRI). Um trecho de HTML que chegue por um backup importado ou por um campo sincronizado não consegue rodar código, e uma biblioteca alterada no CDN não é aceita.
- Este repositório é público, mas **não contém dados de ninguém**. A versão publicada leva apenas um modelo vazio (`dados_curso.template.js`), e o build é interrompido se encontrar dados pessoais no pacote.

## Como funciona

| Parte | Tecnologia |
|---|---|
| Interface | HTML, CSS e JavaScript puros, num único `index.html`, sem framework nem etapa de build no desenvolvimento |
| Gráficos | [Chart.js](https://www.chartjs.org/), carregado só quando a aba Notas abre |
| App instalável e offline | Web App Manifest + Service Worker (`sw.js`) |
| Conta e sincronização | [Supabase](https://supabase.com/) (Auth + Postgres + Realtime), em `sync.js` |
| Publicação | GitHub Pages via GitHub Actions |

**Sincronização em resumo:** cada gravação local é marcada com horário e enviada para a tabela `kv` (uma linha por item). Ao abrir o app, ao voltar para ele e em tempo real, as alterações mais novas de outros aparelhos são aplicadas; ao voltar para o app, ele confere primeiro só os horários e baixa apenas os itens que mudaram. Em caso de conflito, vale a alteração mais recente de cada item.

## Desenvolvimento

Rodar localmente (o service worker exige `http://`, não `file://`):

```bash
python -m http.server 8731 --bind 127.0.0.1
```

Depois, abra `http://localhost:8731`. O `--bind 127.0.0.1` importa: sem ele o servidor atende toda a rede, e quem estiver no mesmo Wi-Fi consegue baixar a pasta inteira (os seus dados em `dados_curso.js`, backups e a chave de `supabase/vapid.local.env`). O `index.html` também abre direto com duplo clique, só sem o modo offline do PWA.

Gerar a versão de publicação em `dist/`:

```bash
node scripts/build-pwa.mjs
```

O build copia o app, troca os dados pelo modelo vazio, carimba o service worker com uma versão nova e acrescenta a política de segurança (CSP) com a impressão digital do script do app. Abrindo o `index.html` direto, sem o build, ela não se aplica. Ao enviar para a branch `main`, o GitHub Actions faz o build e publica no GitHub Pages.

Para usar um projeto Supabase próprio, rode [`supabase/schema.sql`](supabase/schema.sql) e [`supabase/limits.sql`](supabase/limits.sql) no SQL Editor e troque a URL e a chave pública no início de [`sync.js`](sync.js). O `limits.sql` limita o espaço de cada conta (20 MB): como qualquer pessoa pode criar conta, sem ele uma só conta conseguiria encher o banco.

### Estrutura

```
index.html                 o app inteiro (interface, estilos e lógica)
sync.js                    login e sincronização com o Supabase
sw.js                      service worker: cache e funcionamento offline
manifest.webmanifest       nome, ícones e atalhos do app instalado
dados_curso.template.js    modelo de dados vazio usado na publicação
icons/                     ícones do app
scripts/build-pwa.mjs      gera dist/ para publicar
supabase/schema.sql        tabela e regras de acesso
.github/workflows/         publicação automática no GitHub Pages
```
