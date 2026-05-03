/* Final Draft XML (.fdx) exporter
   FDX is the industry-standard Final Draft format, an XML-based spec.
   Compatible with Final Draft 10/11/12 and most professional script tools.
*/

function blockTypeToFdx(type) {
  const map = {
    'scene-heading':  'Scene Heading',
    'action':         'Action',
    'character':      'Character',
    'dialogue':       'Dialogue',
    'parenthetical':  'Parenthetical',
    'transition':     'Transition',
    'shot':           'Shot',
  };
  return map[type] || 'Action';
}

function escXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function exportToFdx(blocks, title) {
  const paragraphs = blocks.map(block => {
    const fdxType = blockTypeToFdx(block.type);
    const text = escXml(block.text || '');
    return `    <Paragraph Type="${fdxType}">
      <Text>${text}</Text>
    </Paragraph>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
    <Paragraph Type="Action">
      <Text></Text>
    </Paragraph>
${paragraphs}
    <Paragraph Type="Action">
      <Text></Text>
    </Paragraph>
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Type="Custom" Alignment="Center">
        <Text>${escXml(title)}</Text>
      </Paragraph>
      <Paragraph Type="Custom" Alignment="Center">
        <Text></Text>
      </Paragraph>
      <Paragraph Type="Custom" Alignment="Center">
        <Text>Written with ScriptForge</Text>
      </Paragraph>
    </Content>
  </TitlePage>
  <ElementSettings>
    <ElementSetting Type="Scene Heading">
      <Paragraph Alignment="Left"/>
      <FontSpec Style="Bold" Color="#000000"/>
    </ElementSetting>
    <ElementSetting Type="Action">
      <Paragraph Alignment="Left"/>
    </ElementSetting>
    <ElementSetting Type="Character">
      <Paragraph Alignment="Center"/>
    </ElementSetting>
    <ElementSetting Type="Parenthetical">
      <Paragraph Alignment="Center"/>
    </ElementSetting>
    <ElementSetting Type="Dialogue">
      <Paragraph Alignment="Left"/>
    </ElementSetting>
    <ElementSetting Type="Transition">
      <Paragraph Alignment="Right"/>
    </ElementSetting>
  </ElementSettings>
</FinalDraft>`;

  return xml;
}

module.exports = { exportToFdx };
