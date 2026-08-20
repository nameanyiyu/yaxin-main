import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const introductionPath = path.join(process.cwd(), 'public', 'introduction.html');
const html = readFileSync(introductionPath, 'utf8');

describe('customer introduction page', () => {
  it('contains the approved presentation narrative and accessible structure', () => {
    expect(html).toContain('商机准入前置管控智能工作台');
    expect(html).toContain('商机向前');
    expect(html).toContain('风险判断也向前');
    expect(html).toContain('销售语音访谈');
    expect(html).toContain('AI 信息提取');
    expect(html).toContain('项目跟踪');
    expect(html).toContain('数据分析');
    expect(html).toContain('01 / 02');
    expect(html).toContain('02 / 02');
    expect(html).toContain('后续项目跟踪效率低');
    expect(html).toContain('让智能管理更高效');
    expect(html).not.toContain('从“填完一张表”');
    expect(html).not.toContain('风险判断不一致');
    expect(html).not.toContain('审批后缺少跟踪');
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('data:image/webp;base64,');
    expect(html).not.toContain('assets/introduction/asiainfo-logo.png');
    expect(html).not.toContain('585829a1261a7be28b2826e76977fd9a.jpg');
    expect(html).toContain('data-ha-style="document"');
    expect(html).toContain('data-brand-direction="architectural-c"');
    expect(html).toContain('data-polish-level="flagship"');
    expect(html).toContain('section-indexed');
    expect(html).toContain('brand-structure');
    expect(html).toContain('control-chain');
    expect(html).toContain('product-evidence');
    expect(html).toContain('management-outcomes');
    expect(html).toContain('--asiainfo-orange: #f36b21');
    expect(html).toContain('--asiainfo-green: #19b45b');
    expect(html).toContain('--asiainfo-silver: #c9ced3');
    expect(html).not.toContain('backdrop-filter');
    expect(html).not.toContain('background-clip: text');
  });
});
