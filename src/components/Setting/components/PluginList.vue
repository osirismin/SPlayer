<template>
  <n-card class="set-item" id="plugin-list" content-style="flex-direction: column">
    <n-flex justify="space-between">
      <div class="label">
        <n-text class="name">已安装插件</n-text>
        <n-text class="tip" :depth="3">管理已导入的外部 .js 插件</n-text>
      </div>
      <n-button strong secondary type="primary" @click="handleImport">
        <template #icon>
          <SvgIcon name="Add" />
        </template>
        导入
      </n-button>
    </n-flex>
    <n-collapse-transition :show="pluginStore.plugins.length > 0">
      <n-card
        v-for="plugin in pluginStore.plugins"
        :key="plugin.id"
        class="set-item sub-item"
        content-style="padding: 12px 16px"
      >
        <div class="label">
          <n-flex align="center" :size="8">
            <n-text class="name">{{ plugin.meta.name }}</n-text>
            <n-tag size="small" type="info" round>
              v{{ plugin.meta.version }}
            </n-tag>
            <n-tag
              v-for="cap in plugin.capabilities"
              :key="cap"
              size="small"
              :type="capabilityTagType(cap)"
              round
            >
              {{ capabilityLabel(cap) }}
            </n-tag>
            <n-tag v-if="plugin.running" size="small" type="success" round>
              运行中
            </n-tag>
          </n-flex>
          <n-text class="tip" :depth="3">{{ plugin.meta.description }}</n-text>
        </div>
        <n-flex class="set" justify="end" :size="8">
          <n-popconfirm
            @positive-click="() => handleRemove(plugin.id)"
            placement="top-end"
          >
            <template #trigger>
              <n-button strong secondary type="error">
                <template #icon>
                  <SvgIcon name="Delete" />
                </template>
              </n-button>
            </template>
            确定删除插件「{{ plugin.meta.name }}」？
          </n-popconfirm>
          <n-switch
            class="set"
            :round="false"
            :value="plugin.enabled"
            :loading="loadingId === plugin.id"
            @update:value="(val: boolean) => handleToggle(plugin.id, val)"
          />
        </n-flex>
      </n-card>
    </n-collapse-transition>
    <n-empty v-if="pluginStore.plugins.length === 0" description="暂无已安装的插件" />
  </n-card>
</template>

<script setup lang="ts">
import { usePluginStore } from "@/stores";
import type { PluginCapability } from "@/types/plugin";

const pluginStore = usePluginStore();
const loadingId = ref<string | null>(null);

// 能力标签文字
const capabilityLabel = (cap: PluginCapability): string => {
  const labels: Record<PluginCapability, string> = {
    "audio-source": "音频源",
  };
  return labels[cap] || cap;
};

// 能力标签类型
const capabilityTagType = (cap: PluginCapability): "primary" | "info" => {
  const types: Record<PluginCapability, "primary" | "info"> = {
    "audio-source": "primary",
  };
  return types[cap] || "info";
};

// 导入插件
const handleImport = async () => {
  try {
    const imported = await pluginStore.importFromFile();
    if (imported) {
      window.$message.success("插件导入成功");
    }
  } catch (e: unknown) {
    console.error("导入插件失败:", e);
    window.$message.error(e instanceof Error ? e.message : "导入插件失败");
  }
};

// 切换启用/禁用
const handleToggle = async (id: string, enabled: boolean) => {
  loadingId.value = id;
  try {
    await pluginStore.togglePlugin(id, enabled);
  } finally {
    loadingId.value = null;
  }
};

// 删除插件
const handleRemove = async (id: string) => {
  try {
    await pluginStore.removePlugin(id);
    window.$message.success("插件已删除");
  } catch (e) {
    console.error("删除插件失败:", e);
    window.$message.error("删除插件失败");
  }
};
</script>

<style lang="scss" scoped>
#plugin-list {
  .sub-item {
    margin-top: 12px;
    background-color: rgba(var(--primary), 0.05);
  }
  .n-flex {
    width: 100%;
  }
  .n-collapse-transition {
    margin-top: 12px;
  }
  .set {
    width: 200px;
  }
}
</style>
