<script setup lang="ts">
import { storeToRefs } from 'pinia'

import BackendHealthStatus from '@/features/health/components/BackendHealthStatus.vue'

import ThoughtEdgeInspector from './ThoughtEdgeInspector.vue'
import ThoughtModelGraph from './ThoughtModelGraph.vue'
import ThoughtNodeInspector from './ThoughtNodeInspector.vue'
import { useThoughtModelWorkbenchStore } from '../stores/workbench'

const workbench = useThoughtModelWorkbenchStore()
const { model, activeView, selectedNode, selectedEdge } = storeToRefs(workbench)

function getNodeText(nodeId: string): string {
  return model.value.nodes.find((node) => node.id === nodeId)?.text ?? nodeId
}
</script>

<template>
  <main class="workbench">
    <header class="workbench__header">
      <div>
        <p class="eyebrow">Gyrnote · M1 手工思维模型</p>
        <h1>{{ model.title }}</h1>
        <p class="summary">
          {{ model.nodes.length }} 个节点 · {{ model.edges.length }} 条关系 · 本地示例版本 v{{
            model.version
          }}
        </p>
        <BackendHealthStatus />
      </div>

      <div class="view-switcher" aria-label="思维模型视图">
        <button
          :class="{ 'is-active': activeView === 'graph' }"
          type="button"
          @click="workbench.selectView('graph')"
        >
          图视图
        </button>
        <button
          :class="{ 'is-active': activeView === 'outline' }"
          type="button"
          @click="workbench.selectView('outline')"
        >
          大纲视图
        </button>
      </div>
    </header>

    <section class="workbench__body">
      <ThoughtModelGraph
        v-if="activeView === 'graph'"
        :model="model"
        @select-node="workbench.selectNode"
        @select-edge="workbench.selectEdge"
      />

      <div v-else class="outline-view">
        <section>
          <h2>节点</h2>
          <ol class="outline" aria-label="思维模型节点">
            <li v-for="node in model.nodes" :key="node.id">
              <button type="button" @click="workbench.selectNode(node.id)">
                <span class="node-type">{{ node.type }}</span>
                <span>{{ node.text }}</span>
              </button>
            </li>
          </ol>
        </section>

        <section>
          <h2>关系</h2>
          <ol class="relation-list" aria-label="思维模型关系">
            <li v-for="edge in model.edges" :key="edge.id">
              <button type="button" @click="workbench.selectEdge(edge.id)">
                <span>{{ getNodeText(edge.sourceNodeId) }}</span>
                <span class="relation-type">{{ edge.type }}</span>
                <span>{{ getNodeText(edge.targetNodeId) }}</span>
              </button>
            </li>
          </ol>
        </section>
      </div>

      <ThoughtEdgeInspector
        v-if="selectedEdge"
        :edge="selectedEdge"
        :source-text="getNodeText(selectedEdge.sourceNodeId)"
        :target-text="getNodeText(selectedEdge.targetNodeId)"
        @save="workbench.updateSelectedEdgeType"
      />
      <ThoughtNodeInspector v-else :node="selectedNode" @save="workbench.updateSelectedNodeText" />
    </section>
  </main>
</template>

<style scoped>
.workbench {
  min-height: 100vh;
  padding: 32px;
  color: #20251f;
  background: #f3f0e8;
}

.workbench__header,
.workbench__body {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.workbench__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

.eyebrow,
.summary {
  color: #687064;
}

.eyebrow {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(28px, 4vw, 44px);
  font-weight: 650;
  letter-spacing: -0.04em;
}

.view-switcher {
  display: flex;
  padding: 4px;
  border: 1px solid #d3d2c8;
  border-radius: 12px;
  background: #e8e5dc;
}

.view-switcher button,
.outline button,
.relation-list button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.view-switcher button {
  padding: 8px 14px;
  border-radius: 8px;
  background: transparent;
}

.view-switcher button.is-active {
  background: #ffffff;
  box-shadow: 0 1px 4px rgb(30 40 30 / 12%);
}

.workbench__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 620px;
  overflow: hidden;
  border: 1px solid #d8d6cb;
  border-radius: 18px;
  background: #fffdf8;
  box-shadow: 0 18px 50px rgb(43 48 38 / 10%);
}

.outline-view {
  padding: 28px;
  overflow: auto;
}

.outline-view section + section {
  margin-top: 30px;
}

.outline-view h2 {
  margin-bottom: 12px;
  font-size: 16px;
}

.outline,
.relation-list {
  display: grid;
  align-content: start;
  gap: 12px;
  list-style: none;
}

.outline button,
.relation-list button {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 14px;
  padding: 18px;
  border: 1px solid #deddd4;
  border-radius: 12px;
  color: inherit;
  text-align: left;
  background: #ffffff;
}

.outline button:hover,
.outline button:focus-visible,
.relation-list button:hover,
.relation-list button:focus-visible {
  border-color: #7e9478;
  outline: none;
}

.relation-list button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  font-size: 13px;
}

.relation-list button > :first-child {
  text-align: right;
}

.relation-list button > :last-child {
  text-align: left;
}

.relation-type {
  padding: 4px 8px;
  border-radius: 999px;
  color: #6d5531;
  font-size: 11px;
  font-weight: 700;
  background: #f2e8d5;
}

.node-type {
  display: inline-flex;
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  color: #38523a;
  font-size: 12px;
  font-weight: 700;
  background: #e3eee0;
}

@media (max-width: 760px) {
  .workbench {
    padding: 20px;
  }

  .workbench__header {
    align-items: stretch;
    flex-direction: column;
  }

  .workbench__body {
    grid-template-columns: 1fr;
  }
}
</style>
