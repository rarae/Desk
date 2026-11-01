<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { databases, ID, Query, databaseId, mahjongCollectionId } from '../lib/appwrite'

const SEATS = ['东', '南', '西', '北']
const SEAT_ICON: Record<string, string> = { 东: '🌅', 南: '🌞', 西: '🌿', 北: '❄️' }

const playerCount = ref(4) // 本场人数：3 或 4

// 本场牌局状态（进行中的牌局同时缓存到 localStorage 以便刷新恢复）
const table = ref({
  status: 'idle', // 'idle' | 'playing'
  gameId: '',
  players: [] as { id: string; seat: string; name: string; total: number }[],
  rounds: [] as { no: number; inputs: Record<string, number>; time: number }[],
  current: {} as Record<string, number>,
  roundNo: 0,
})
const names = ref({ 东: '', 南: '', 西: '', 北: '' })

function openTable() {
  const seats = SEATS.slice(0, playerCount.value)
  const players = seats.map((seat, i) => ({
    id: 'p' + i,
    seat,
    name: (names.value[seat] || '').trim() || seat,
    total: 0,
  }))
  table.value = {
    status: 'playing',
    gameId: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    players,
    rounds: [],
    current: {},
    roundNo: 0,
  }
  save()
}

// ---- 编辑某玩家本局输赢 ----
const editing = ref<string | null>(null)
const editWin = ref(true)
const editAmount = ref(0)
const editingPlayer = computed(
  () => table.value.players.find((p) => p.id === editing.value) || null
)

function startEdit(player: { id: string }) {
  editing.value = player.id
  const v = table.value.current[player.id]
  if (v == null) {
    editWin.value = true
    editAmount.value = 0
  } else {
    editWin.value = v > 0
    editAmount.value = Math.abs(v)
  }
}

function confirmEdit() {
  if (editing.value == null) return
  const amt = Number(editAmount.value)
  if (!amt || amt <= 0) delete table.value.current[editing.value]
  else table.value.current[editing.value] = editWin.value ? amt : -amt
  editing.value = null
  save()
}

function clearEdit() {
  if (editing.value != null) delete table.value.current[editing.value]
  editing.value = null
  save()
}

// ---- 平衡校验：所有玩家都填完且代数和为 0（总赢=总输）----
const allFilled = computed(
  () =>
    table.value.players.length > 0 &&
    table.value.players.every((p) => table.value.current[p.id] != null)
)
const sumCurrent = computed(() =>
  table.value.players.reduce((s, p) => s + (table.value.current[p.id] || 0), 0)
)
const balanced = computed(() => Math.abs(sumCurrent.value) < 0.001)
const diffText = computed(() => Math.abs(sumCurrent.value).toFixed(0))

// ---- 提交本局：写入 Appwrite ----
const saving = ref(false)
const msg = ref('')
async function submitRound() {
  if (!allFilled.value || !balanced.value) return
  saving.value = true
  msg.value = ''
  const cur = table.value.current
  const players = table.value.players
  const seats = ['East', 'South', 'West', 'North']
  const doc: any = { gameId: table.value.gameId, roundNo: table.value.roundNo + 1 }
  seats.forEach((sk, i) => {
    const p = players[i]
    doc['player' + sk] = p ? p.name : ''
    doc['score' + sk] = p ? cur[p.id] || 0 : 0
  })
  try {
    await databases.createDocument(databaseId, mahjongCollectionId, ID.unique(), doc)
    for (const p of table.value.players) p.total += cur[p.id] || 0
    table.value.rounds.push({ no: doc.roundNo, inputs: { ...cur }, time: Date.now() })
    table.value.roundNo += 1
    table.value.current = {}
    save()
    msg.value = '已保存到数据库 ✓'
  } catch (err) {
    msg.value = '保存失败：' + (err?.message || err)
  } finally {
    saving.value = false
  }
}

function closeTable() {
  if (!confirm('确定关台并清空当前牌局？（已存入数据库的历史记录不会删除）')) return
  table.value = { status: 'idle', gameId: '', players: [], rounds: [], current: {}, roundNo: 0 }
  names.value = { 东: '', 南: '', 西: '', 北: '' }
  save()
}

// ---- 本地缓存（仅用于刷新恢复进行中的牌局）----
function save() {
  localStorage.setItem('mahjong-table', JSON.stringify(table.value))
}
function load() {
  try {
    const raw = localStorage.getItem('mahjong-table')
    if (raw) table.value = JSON.parse(raw)
  } catch (e) {
    /* ignore */
  }
}
load()

const ranking = computed(() => [...table.value.players].sort((a, b) => b.total - a.total))
// 把 + / - 换成「赢 / 输」文字
function fmt(n: number) {
  const v = Number(n) || 0
  if (v > 0) return '赢 ' + v
  if (v < 0) return '输 ' + Math.abs(v)
  return '平'
}

// 历史记录：把一局文档整理成玩家数组（过滤掉 3 人局里为空的北位）
function recPlayers(d: any) {
  return [
    { name: d.playerEast, score: d.scoreEast },
    { name: d.playerSouth, score: d.scoreSouth },
    { name: d.playerWest, score: d.scoreWest },
    { name: d.playerNorth, score: d.scoreNorth },
  ].filter((p) => p.name && p.name.trim())
}

// ---- 历史记录查询（从 Appwrite 读取）----
const view = ref('score') // 'score' | 'history'
const records = ref<any[]>([])
const loadingHistory = ref(false)
const filterName = ref('')
const historyError = ref('')

async function loadHistory() {
  loadingHistory.value = true
  historyError.value = ''
  try {
    const r = await databases.listDocuments(databaseId, mahjongCollectionId, [
      Query.orderDesc('$createdAt'),
      Query.limit(200),
    ])
    records.value = r.documents
  } catch (e) {
    historyError.value = '加载失败：' + (e?.message || e)
  } finally {
    loadingHistory.value = false
  }
}

// 切到历史标签时自动加载一次
watch(view, (v) => {
  if (v === 'history' && records.value.length === 0) loadHistory()
})

// 按开台（gameId）分组，便于清晰区分不同场次
const groupedGames = computed(() => {
  const map = new Map<string, any>()
  for (const d of records.value) {
    if (!map.has(d.gameId)) {
      map.set(d.gameId, { gameId: d.gameId, rounds: [], players: {}, start: d.$createdAt })
    }
    const g = map.get(d.gameId)
    g.rounds.push(d)
    const seats = ['East', 'South', 'West', 'North']
    seats.forEach((sk) => {
      const name = d['player' + sk]
      const score = d['score' + sk]
      if (name && name.trim()) {
        if (g.players[name] == null) g.players[name] = 0
        g.players[name] += score
      }
    })
    if (d.$createdAt < g.start) g.start = d.$createdAt
  }
  const arr = [...map.values()]
  arr.sort((a, b) => (a.start < b.start ? 1 : -1)) // 最新开台在前
  for (const g of arr) g.rounds.sort((a, b) => b.roundNo - a.roundNo) // 最新对局在最前
  return arr
})
const filteredGames = computed(() => {
  const n = filterName.value.trim()
  if (!n) return groupedGames.value
  return groupedGames.value.filter((g) => Object.prototype.hasOwnProperty.call(g.players, n))
})
// 给不同开台分配不同的柔和强调色，便于区分
const GAME_COLORS = ['#a7e8c0', '#ffd6e0', '#bfe3ff', '#ffe2b8', '#d9ccff']
function gameColor(i: number) {
  return GAME_COLORS[i % GAME_COLORS.length]
}

// 某玩家累计战绩（遍历所有记录，按所在座位累加）
const playerTotal = computed(() => {
  const n = filterName.value.trim()
  if (!n) return null
  let t = 0
  for (const d of records.value) {
    if (d.playerEast === n) t += d.scoreEast
    if (d.playerSouth === n) t += d.scoreSouth
    if (d.playerWest === n) t += d.scoreWest
    if (d.playerNorth === n) t += d.scoreNorth
  }
  return t
})

function fmtTime(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-6">
    <!-- 顶部切换 -->
    <div class="mb-5 grid grid-cols-2 gap-2 rounded-full bg-zinc-100 p-1">
      <button
        @click="view = 'score'"
        :class="view === 'score' ? 'rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow' : 'rounded-full px-4 py-2 text-sm font-medium text-zinc-500'"
      >🀄 本场计分</button>
      <button
        @click="view = 'history'"
        :class="view === 'history' ? 'rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow' : 'rounded-full px-4 py-2 text-sm font-medium text-zinc-500'"
      >📒 历史记录</button>
    </div>

    <!-- 本场计分 -->
    <div v-show="view === 'score'" class="space-y-4">
      <!-- 开台 -->
      <div v-if="table.status === 'idle'" class="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-100">
        <h2 class="mb-1 flex items-center gap-2 text-xl font-bold text-zinc-800">🀄 开台</h2>
        <p class="mb-4 text-sm text-zinc-500">选择人数并填入玩家昵称，开始记分</p>
        <div class="mb-4 flex items-center gap-3">
          <span class="text-sm font-semibold text-zinc-700">开局人数</span>
          <div class="flex gap-2">
            <button
              @click="playerCount = 3"
              :class="playerCount === 3 ? 'rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white' : 'rounded-full bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-600'"
            >3 人</button>
            <button
              @click="playerCount = 4"
              :class="playerCount === 4 ? 'rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white' : 'rounded-full bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-600'"
            >4 人</button>
          </div>
        </div>
        <div class="mb-4 grid grid-cols-2 gap-3">
          <div v-for="s in SEATS.slice(0, playerCount)" :key="s" class="space-y-1">
            <label class="text-sm font-medium text-zinc-700">{{ SEAT_ICON[s] }} {{ s }}方</label>
            <input
              v-model="names[s]"
              :placeholder="s + '方昵称'"
              class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>
        <button
          @click="openTable"
          class="w-full rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
        >🎉 开台开始</button>
      </div>

      <!-- 计分中 -->
      <div v-else class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-zinc-800">雀神榜 · 第 {{ table.roundNo + 1 }} 局</h2>
          <button
            @click="closeTable"
            class="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50"
          >关台</button>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="p in table.players"
            :key="p.id"
            @click="startEdit(p)"
            class="cursor-pointer rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-zinc-100 transition hover:-translate-y-0.5 hover:shadow-md"
            :class="{ 'ring-2 ring-emerald-500': editing === p.id, 'border border-emerald-300': table.current[p.id] != null }"
          >
            <div class="text-xs text-zinc-400">{{ SEAT_ICON[p.seat] }} {{ p.seat }}</div>
            <div class="text-base font-bold text-zinc-800">{{ p.name }}</div>
            <div class="text-sm font-semibold" :class="p.total >= 0 ? 'text-emerald-600' : 'text-rose-600'">累计 {{ fmt(p.total) }}</div>
            <div v-if="table.current[p.id] != null" class="text-xs text-zinc-400">本局 {{ fmt(table.current[p.id]) }}</div>
            <div v-else class="text-xs text-zinc-400">点击填写</div>
          </div>
        </div>

        <div class="space-y-2 text-center">
          <p v-if="!allFilled" class="text-sm text-zinc-500">请填完所有玩家本局输赢</p>
          <p v-else-if="!balanced" class="text-sm font-medium text-rose-600">未配平：差 {{ diffText }}，请检查</p>
          <p v-else class="text-sm font-medium text-emerald-600">已平衡，可提交本局 ✓</p>
          <p v-if="msg" class="text-sm" :class="msg.includes('失败') ? 'text-rose-600' : 'text-emerald-600'">{{ msg }}</p>
          <button
            @click="submitRound"
            :disabled="!allFilled || !balanced || saving"
            class="w-full rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >{{ saving ? '保存中…' : '✅ 提交本局，进入下一局' }}</button>
        </div>

        <div class="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
          <h3 class="mb-3 text-base font-bold text-zinc-800">🏆 实时排名</h3>
          <ol class="space-y-1">
            <li v-for="(p, i) in ranking" :key="p.id" class="flex items-center justify-between text-sm">
              <span class="text-zinc-700">{{ ['🥇', '🥈', '🥉', '🍀'][i] }} {{ p.name }}（{{ p.seat }}）</span>
              <span class="font-semibold" :class="p.total >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ fmt(p.total) }}</span>
            </li>
          </ol>
        </div>
      </div>
    </div>

    <!-- 历史记录 -->
    <div v-show="view === 'history'" class="space-y-4">
      <div class="flex gap-2">
        <input
          v-model="filterName"
          placeholder="按玩家昵称筛选（可留空看全部）"
          class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
        <button
          @click="loadHistory"
          class="shrink-0 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50"
        >🔄 刷新</button>
      </div>
      <p v-if="playerTotal !== null" class="text-sm text-zinc-600">
        {{ filterName.trim() }} 累计战绩（所有开台合计）：
        <span class="font-semibold" :class="playerTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ fmt(playerTotal) }}</span>
      </p>
      <p v-if="historyError" class="text-sm text-rose-600">{{ historyError }}</p>
      <p v-if="loadingHistory" class="text-sm text-zinc-500">加载中…</p>
      <p v-else-if="!records.length" class="text-sm text-zinc-500">还没有记录，先去开台记分吧～</p>

      <div v-else class="space-y-4">
        <div
          v-for="(g, gi) in filteredGames"
          :key="g.gameId"
          class="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-zinc-100"
        >
          <div class="flex items-center justify-between px-5 py-3" :style="{ background: gameColor(gi) }">
            <span class="text-base font-bold text-zinc-800">🀄 开台 · {{ fmtTime(g.start) }}</span>
            <span class="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-zinc-700">{{ g.rounds.length }} 局</span>
          </div>
          <div class="flex flex-wrap gap-2 bg-emerald-50/40 px-5 py-3">
            <span
              v-for="(total, name) in g.players"
              :key="name"
              class="rounded-full bg-white px-3 py-1 text-sm font-semibold shadow-sm"
              :class="total >= 0 ? 'text-emerald-600' : 'text-rose-600'"
            >{{ name }} {{ fmt(total) }}</span>
          </div>
          <ul class="space-y-0 px-5 py-3">
            <li
              v-for="d in g.rounds"
              :key="d.$id"
              class="flex flex-wrap items-center gap-2 border-b border-dashed border-zinc-100 py-2 text-sm last:border-0"
            >
              <span class="font-semibold text-zinc-400">第{{ d.roundNo }}局</span>
              <span v-for="(p, i) in recPlayers(d)" :key="i" class="inline-flex items-center gap-1 text-zinc-700">
                {{ p.name }}
                <b :class="p.score >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ fmt(p.score) }}</b>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 填写弹窗（原生） -->
    <div
      v-if="editing != null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="clearEdit"
    >
      <div class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h3 class="mb-4 text-lg font-semibold text-zinc-800">
          {{ editingPlayer ? editingPlayer.name + '（' + editingPlayer.seat + '）' : '' }} 本局
        </h3>
        <div class="space-y-4">
          <div class="flex gap-2">
            <button
              @click="editWin = true"
              :class="editWin ? 'flex-1 rounded-full bg-emerald-600 py-2 text-sm font-semibold text-white' : 'flex-1 rounded-full bg-zinc-100 py-2 text-sm font-medium text-zinc-600'"
            >😺 赢钱</button>
            <button
              @click="editWin = false"
              :class="!editWin ? 'flex-1 rounded-full bg-emerald-600 py-2 text-sm font-semibold text-white' : 'flex-1 rounded-full bg-zinc-100 py-2 text-sm font-medium text-zinc-600'"
            >😿 输钱</button>
          </div>
          <input
            type="number"
            min="0"
            inputmode="numeric"
            v-model.number="editAmount"
            placeholder="金额"
            class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div class="mt-5 flex gap-2">
          <button
            @click="clearEdit"
            class="flex-1 rounded-full bg-zinc-100 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200"
          >取消</button>
          <button
            @click="confirmEdit"
            class="flex-1 rounded-full bg-emerald-600 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >确定</button>
        </div>
      </div>
    </div>
  </div>
</template>
