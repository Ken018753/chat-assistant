/**
 * 高情商聊天回复生成引擎
 * 基于场景识别 + 关系策略 + 风格调节的复合生成系统
 *
 * 结构：
 *   1. 场景关键词映射 (SCENARIO_KEYWORDS)
 *   2. 关系标签 / 风格定义
 *   3. 辅助函数 (extractTopic / analyzeSentiment / detectQuestion / detectScenario)
 *   4. 开场白模板 (OPENERS)
 *   5. 场景策略库 (STRATEGIES) — 每个场景返回 3 个不同角度的回复方案
 *   6. 通用兜底 (GENERAL_FALLBACK)
 *   7. 对外 API: generate(input) -> { scenario, sentiment, results[], tips[] }
 */
const ChatEngine = (function () {

  // ========== 场景关键词映射 ==========
  const SCENARIO_KEYWORDS = {
    decline:      ['拒绝','不想','婉拒','推掉','回绝','不能答应','不好意','推了','帮不了'],
    gratitude:    ['感谢','谢谢','多谢','多亏','感恩','谢意','答谢'],
    apology:      ['道歉','抱歉','对不起','不好意思','赔罪','认错','做错了'],
    leave:        ['请假','休息一天','不来','缺席','调休','事假','病假','回去','过不去'],
    report:       ['汇报','报告','进度','总结','同步进展','交代'],
    followup:     ['催','提醒','跟进','催促','问一下进度','推进','怎么样了','回复'],
    invitation:   ['约饭','约','出来','见面','聚聚','吃个饭','喝杯','约一下','约你'],
    greeting:     ['祝','节日','生日','新年','祝福','恭喜','贺','快乐'],
    agreement:    ['同意','好的没问题','答应','接受','确认','可以的','收到'],
    negotiation:  ['价格','便宜','优惠','折扣','砍价','预算','费用','多少钱','商量'],
    comfort:      ['安慰','难过','不开心','心情不好','丧','压力','郁闷','辛苦了','别难过'],
    confession:   ['表白','喜欢','心动','暗恋','好感','在一起'],
  };

  // ========== 关系标签 ==========
  const RELATIONSHIPS = {
    colleague:   { label:'同事',       icon:'👥' },
    boss:        { label:'领导',       icon:'👔' },
    client:      { label:'客户',       icon:'🤝' },
    friend:      { label:'朋友',       icon:'😊' },
    date:        { label:'相亲/暧昧',  icon:'💕' },
    family:      { label:'家人',       icon:'🏠' },
    elder:       { label:'长辈',       icon:'🙇' },
    acquaintance:{ label:'熟人',       icon:'👋' },
  };

  // ========== 风格 ==========
  const STYLES = {
    formal:   { label:'正式', icon:'📋' },
    humorous: { label:'幽默', icon:'😄' },
    tactful:  { label:'委婉', icon:'🌸' },
    direct:   { label:'直接', icon:'⚡' },
  };

  // ========== 辅助 ==========

  function extractTopic(purpose) {
    if (!purpose) return '这件事';
    let t = purpose.trim();
    // 去掉场景关键词前缀
    for (const kws of Object.values(SCENARIO_KEYWORDS))
      for (const kw of kws)
        if (t.startsWith(kw)) { t = t.slice(kw.length).replace(/^[，,、\s]+/,''); break; }
    // 去掉关系词前缀（领导/同事/客户/朋友/家人/长辈等）
    const relWords = ['领导','同事','客户','朋友','家人','长辈','老板','甲方','对方','他','她','你','你们','咱们'];
    let changed = true;
    while (changed) {
      changed = false;
      for (const rw of relWords) {
        if (t.startsWith(rw)) { t = t.slice(rw.length).replace(/^[的让叫请让]+/,'').replace(/^[，,、\s]+/,''); changed = true; }
      }
    }
    // 去掉常见动词前缀
    t = t.replace(/^(帮我|让我|帮忙|让|请|要|想|需要|帮忙)[，,、\s]*/,'');
    return t.length > 30 ? t.slice(0,30)+'…' : (t || '这件事');
  }

  function analyzeSentiment(context) {
    if (!context) return 'neutral';
    const neg = ['生气','不满','抱怨','骂','烦','讨厌','失望','质问','催','为什么','怎么回事','不行','有问题','？？？'];
    const pos = ['开心','高兴','谢谢','好的','没问题','太好了','棒','厉害','辛苦了','感谢'];
    const angry = ['滚','闭嘴','别烦','你有病','无语'];
    let n=0,p=0;
    neg.forEach(w=>{ if(context.includes(w))n++; });
    pos.forEach(w=>{ if(context.includes(w))p++; });
    angry.forEach(w=>{ if(context.includes(w))n+=2; });
    if (n>p+1) return 'negative';
    if (p>n) return 'positive';
    return 'neutral';
  }

  function detectScenario(purpose) {
    if (!purpose) return 'general';
    const text = purpose;
    for (const [sc, kws] of Object.entries(SCENARIO_KEYWORDS))
      for (const kw of kws)
        if (text.includes(kw)) return sc;
    return 'general';
  }

  /** 填充开场白 */
  function fillOpener(rel, sty, topic) {
    const bank = OPENERS[rel] || OPENERS.acquaintance;
    const arr = bank[sty] || bank.formal;
    return arr[Math.floor(Math.random()*arr.length)].replace(/\$\{topic\}/g, topic);
  }

  /** 从 plan 对象中按关系+风格取值，带兜底 */
  function pickByStyle(plan, rel, sty) {
    const byRel = plan[rel] || plan.colleague || plan.friend;
    const byStyle = (byRel && (byRel[sty] || byRel.formal)) || '（请根据实际情况调整回复）';
    return byStyle;
  }
  function pickByStyleSafe(plan, rel, sty, fallback) {
    if (!plan[rel]) return fallback;
    return plan[rel][sty] || plan[rel].formal || fallback;
  }

  // ========== 开场白 ==========
  const OPENERS = {
    colleague: {
      formal:   ['关于${topic}，我这边同步一下情况：','跟你说一下${topic}的事——'],
      humorous: ['哈喽！关于${topic}这事吧——','先说个好消息和坏消息（开玩笑的），'],
      tactful:  ['想跟你聊一下${topic}，','关于你说的${topic}，我想了想，'],
      direct:   ['${topic}的事，直接说：'],
    },
    boss: {
      formal:   ['领导，关于${topic}向您汇报：','领导，${topic}这边的情况是——'],
      humorous: ['领导好～${topic}这个事吧，','领导，跟您说个事儿（保证不是坏消息）——'],
      tactful:  ['领导，关于${topic}，想跟您请示一下，','领导，${topic}这边我考虑了一下，'],
      direct:   ['领导，${topic}的情况：'],
    },
    client: {
      formal:   ['您好，关于${topic}跟您同步一下：','您好，${topic}的情况是这样的——'],
      humorous: ['您好呀！${topic}这事吧，','跟您说个事儿，保证是好消息方向——'],
      tactful:  ['您好，关于${topic}，想跟您沟通一下，','您好，${topic}这边我了解了一下情况，'],
      direct:   ['您好，${topic}的情况如下：'],
    },
    friend: {
      formal:   ['关于${topic}，跟你说一下：','说下${topic}的事——'],
      humorous: ['哥们/姐妹，${topic}这事吧——','来来来，跟你说个${topic}的事儿，'],
      tactful:  ['那个，关于${topic}，','想跟你说下${topic}，'],
      direct:   ['${topic}，直说了：'],
    },
    date: {
      formal:   ['关于${topic}，想跟你说一下：','想跟你聊一下${topic}——'],
      humorous: ['嘿，${topic}这事儿吧——','跟你说个秘密（也不是秘密）——'],
      tactful:  ['那个…关于${topic}，','想跟你说下${topic}，就是…'],
      direct:   ['${topic}，我跟你说哈：'],
    },
    family: {
      formal:   ['关于${topic}，跟你说一下：','说下${topic}的事——'],
      humorous: ['哈哈，${topic}这事吧——','跟你说个好玩的——'],
      tactful:  ['那个，关于${topic}，','想跟你说下${topic}，'],
      direct:   ['${topic}，直接说：'],
    },
    elder: {
      formal:   ['关于${topic}，跟您汇报一下：','您放心，${topic}这边的情况是——'],
      humorous: ['哈哈，您说${topic}，','跟您说个${topic}的事儿——'],
      tactful:  ['那个，关于${topic}，想跟您说一下，','您别担心，${topic}这边我考虑过了，'],
      direct:   ['${topic}的情况：'],
    },
    acquaintance: {
      formal:   ['关于${topic}，跟你同步一下：','${topic}的情况是这样的——'],
      humorous: ['嗨，${topic}这事吧——','跟你说个${topic}的事儿——'],
      tactful:  ['那个，关于${topic}，','想跟你说下${topic}，'],
      direct:   ['${topic}，简单说：'],
    },
  };

  // ========== 场景策略 ==========
  // 每个函数返回 [方案A, 方案B, 方案C]，代表三个不同角度

  const STRATEGIES = {

    // ---- 拒绝 ----
    decline(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: {
          formal:`${fillOpener(rel,sty,topic)}我目前手上的事情排得比较满，短期内可能没办法兼顾。你看要不要先找其他同事帮忙，或者等我忙完这周再处理？`,
          humorous:`${fillOpener(rel,sty,topic)}我也想接，但手上的活儿已经堆成山了，再接我怕质量问题砸招牌哈哈。要不你先问问别人？忙完这阵我随时补位！`,
          tactful:`${fillOpener(rel,sty,topic)}这个我确实有点难兼顾，手上还有几个在赶的活儿。你看这样行不行，先找其他人顶一下，等我这周忙完了随时帮忙？`,
          direct:`${fillOpener(rel,sty,topic)}这周排满了，暂时接不了。建议先找其他人，我忙完再补位。`,
        },
        boss: {
          formal:`${fillOpener(rel,sty,topic)}目前手上有几个项目在并行推进，如果再加这个任务，可能影响整体进度。建议这个事项可以由其他同事跟进，或者等我完成手头优先级更高的事项后再处理，您看如何？`,
          humorous:`${fillOpener(rel,sty,topic)}我现在手上的活儿已经在"极限操作"了，再加我怕表演翻车。这个能不能安排给其他同事，我忙完这阵随时接手？`,
          tactful:`${fillOpener(rel,sty,topic)}这个任务我很想接，但目前几个项目都在关键节点，担心精力分散影响质量。您看是否可以协调一下人手？我这边忙完优先支持。`,
          direct:`${fillOpener(rel,sty,topic)}目前工作量已满，再接会影响交付质量。建议安排给其他同事，我这周忙完可以接手。`,
        },
        client: {
          formal:`您好，关于${topic}，目前我们的排期比较紧张，短期内可能难以安排。我帮您看了一下，有两个替代方案供参考：一是调整交付时间到下月初，二是由我的同事先跟进。您看哪个更合适？`,
          humorous:`您好呀！${topic}这个我们太想做了，但现在排期真的满了😂。给您两个方案选选看——要么时间往后挪一周，要么我找同事先顶着，您看哪个更方便？`,
          tactful:`您好，关于${topic}，我特别理解您的需求，只是目前排期确实比较满。您看这样行吗，我们稍微调整一下时间节点，或者我先安排同事帮您过渡一下？`,
          direct:`您好，${topic}目前排期已满。建议：方案一延后至下月初，方案二由同事先接手。您选哪个？`,
        },
        friend: {
          formal:`${fillOpener(rel,sty,topic)}这周确实有点忙不过来，可能帮不上忙。不好意思啊，下次有空我请你吃饭！`,
          humorous:`${fillOpener(rel,sty,topic)}兄弟我也想帮，但我现在忙得跟陀螺似的😂 要不你先看看有没有别人能搭把手？等我这阵忙完必须请你吃饭赔罪！`,
          tactful:`${fillOpener(rel,sty,topic)}这个事儿我有点帮不上，最近实在太忙了。等忙完这阵我主动找你，到时候请你吃饭！`,
          direct:`${fillOpener(rel,sty,topic)}这周真没空，帮不了。忙完请你吃饭！`,
        },
        date: {
          formal:`${fillOpener(rel,sty,topic)}这段时间确实比较忙，可能暂时安排不了。等忙完这阵我主动约你好不好？`,
          humorous:`${fillOpener(rel,sty,topic)}我也想去！但这个周末被工作绑架了😭 你先别找别人啊（开玩笑的），等我忙完第一时间约你！`,
          tactful:`${fillOpener(rel,sty,topic)}这个周末可能不太方便…最近事情有点多。等我忙完这阵，一定主动约你好不好？`,
          direct:`${fillOpener(rel,sty,topic)}这周末不行，太忙了。下周我约你！`,
        },
        family: {
          formal:`${fillOpener(rel,sty,topic)}最近确实比较忙，可能暂时顾不上。等忙完这阵我回来处理，你别着急。`,
          humorous:`${fillOpener(rel,sty,topic)}你儿子/女儿现在忙得跟打仗似的😂 等忙完这阵马上回来搞，你先别操心！`,
          tactful:`${fillOpener(rel,sty,topic)}这个事情我可能暂时没时间弄…等我忙完这阵回来处理好不好？你别太操心。`,
          direct:`${fillOpener(rel,sty,topic)}最近太忙了顾不上，等我忙完回来弄。`,
        },
        elder: {
          formal:`${fillOpener(rel,sty,topic)}最近工作比较忙，可能暂时过不去。等忙完这阵一定回去看您，您注意身体。`,
          humorous:`${fillOpener(rel,sty,topic)}您别急，我这不是不想回，是工作绊住了腿哈哈。等忙完这阵马上回去！您先吃好喝好别操心我。`,
          tactful:`${fillOpener(rel,sty,topic)}这段时间可能暂时回不去…工作上有事走不开。等忙完这阵一定回去陪您，您别担心。`,
          direct:`${fillOpener(rel,sty,topic)}最近忙，暂时回不去。忙完就回去看您。`,
        },
        acquaintance: {
          formal:`${fillOpener(rel,sty,topic)}最近确实有点忙，可能不太方便。不好意思啊，下次有机会再约。`,
          humorous:`${fillOpener(rel,sty,topic)}我也想去！但这周已经被工作绑架了😂 下次一定！`,
          tactful:`${fillOpener(rel,sty,topic)}这个可能不太方便…最近事情比较多。下次有机会再约好不好？`,
          direct:`${fillOpener(rel,sty,topic)}这周没空，下次吧。`,
        },
      };
      const B = {
        colleague: {
          formal:`我理解这件事比较急，不过我目前手上的工作量确实没有余量了。如果这件事优先级更高，我可以在本周五之后处理，你看可以接受吗？`,
          humorous:`理解理解，这事儿确实急！但我现在的状态吧，就像一个人在转五个盘子😂 要不咱排个期，周五之后我全力搞定？`,
          tactful:`我知道这个事情比较重要，不过这周确实腾不出手来。如果不是很急的话，下周一我开始处理行吗？`,
          direct:`理解这事着急，但我这周满了。周五之后可以处理，可以吗？`,
        },
        boss: {
          formal:`我理解这个事项的紧迫性。如果需要优先处理，我可以调整手头工作优先级，但部分项目的交付会延后2天。请您指示是否调整优先级？`,
          humorous:`领导我懂这个急！但实话说我现在就像个"任务杂技演员"，再加一个就得掉盘子了😂 要不咱排个优先级，有些可以往后挪挪？`,
          tactful:`领导，这个事项的重要性我理解。如果优先处理的话，需要调整一下手头工作的节奏，您看怎么安排更合适？`,
          direct:`理解此事紧急。若优先处理，需调整现有任务优先级，部分交付会延后。请您决定。`,
        },
        client: {
          formal:`非常理解您的需求。为了确保交付质量，我们建议将时间稍作调整，我可以为您申请一个更合理的排期，同时不影响品质。您看可以吗？`,
          humorous:`太理解您了！但为了不糊弄您，我们得把排期稍微往后挪挪，保证出来的东西对得起您花的钱😂 您看可以吗？`,
          tactful:`您好，特别理解您的着急。为了保证质量，我们稍微调整一下时间节点，这样做出来的东西也更让您满意，您看行吗？`,
          direct:`理解您的需求。为保证质量，建议调整交付时间。我帮您申请合理排期，可以吗？`,
        },
        friend: {
          formal:`我懂这事儿对你挺重要的，但最近真的抽不开身。等我忙完一定第一时间帮你，不会放你鸽子的。`,
          humorous:`懂你急！但兄弟我现在真的是"分身乏术"😂 给我几天时间，忙完马上到！你要是不急我就不说了，你急我就加班帮你想办法！`,
          tactful:`我知道这事儿你挺上心的，我最近真的有点忙不过来。等我缓两天一定帮你弄，好不好？`,
          direct:`懂你着急，但我这几天真没空。周末帮你搞定，行吗？`,
        },
        date: {
          formal:`我特别想约，但最近真的抽不开身。给我一周时间，忙完我好好安排一次，好不好？`,
          humorous:`我比你还想约！但工作不允许啊😭 给我一周时间，忙完我请你吃顿好的补上！`,
          tactful:`我真的很想去…但最近真的太忙了。给我几天时间好不好？忙完我一定好好安排。`,
          direct:`很想去，但这周真没空。下周一定约，我安排。`,
        },
        family: {
          formal:`我知道这件事重要，但最近真的走不开。等我忙完一定回来处理，你们先别急。`,
          humorous:`懂懂懂！但您儿子/女儿现在真的是"被工作焊在工位上"了😂 给我几天时间，忙完马上回来！`,
          tactful:`我知道这事儿你们着急，但我最近真的走不开…等我忙完马上回来弄，好不好？`,
          direct:`知道这事急，但这周走不开。下周回来处理。`,
        },
        elder: {
          formal:`您说的我记在心上了。最近确实忙不过来，等忙完这阵一定回去看您，您千万别着急。`,
          humorous:`您说的话我哪能忘啊！就是工作太忙了走不开😂 等忙完一定回去陪您好好聊！`,
          tactful:`您说的我都记着呢…就是最近真的走不开。等忙完一定回去看您，您别操心。`,
          direct:`记住了。这周忙完就回去看您。`,
        },
        acquaintance: {
          formal:`理解你的需求，不过最近确实不太方便。下次有机会一定安排。`,
          humorous:`懂你意思！但这周真的排满了😂 下次一定！`,
          tactful:`这个…最近确实不太方便。下次有机会再约好不好？`,
          direct:`理解，但这周不行。下次吧。`,
        },
      };
      const C = {
        colleague: {
          formal:`我可以帮你处理其中一部分，比如核心环节。剩下的部分可能需要你自己跟进或者找其他人帮忙，你看这样行吗？`,
          humorous:`全部接吧我怕翻车，但我可以帮你搞最难的那部分！剩下的你自己搞定😂 怎么样，够意思吧？`,
          tactful:`全部帮可能有点困难，但我可以帮你做其中一部分。你看哪些部分最需要帮忙，我优先支持？`,
          direct:`可以帮一部分，剩下的你找人。你说哪些需要我帮？`,
        },
        boss: {
          formal:`如果这个事项可以拆分，我可以负责核心部分，其余部分建议安排其他同事跟进，这样不影响整体进度。`,
          humorous:`全接怕翻车，但我可以挑最硬的骨头啃！剩下的您安排别人，咱分工合作效率更高😂`,
          tactful:`领导，如果可以的话，这个事项我来负责核心部分，其他部分协调一下其他同事？这样质量更有保障。`,
          direct:`可拆分的话，我负责核心部分，其余安排其他同事。可以吗？`,
        },
        client: {
          formal:`我们可以先交付最核心的部分，其余部分在后续阶段逐步完善。这样既不影响您的使用，也能保证质量。您看如何？`,
          humorous:`一口气全做完吧我怕质量打折，咱们分批来？先把最重要的搞定让您用着，剩下的后面补😂 您看行吗？`,
          tactful:`您好，为了确保质量，我们建议分阶段交付。先完成最核心的功能，您看这样可以吗？`,
          direct:`建议分批交付：先做核心部分，其余后续完善。可以吗？`,
        },
        friend: {
          formal:`全部帮可能没时间，但关键的环节我可以搭把手。你先把简单的部分弄着，有难度的找我。`,
          humorous:`全包不可能，但关键环节你哥/姐必须出手！你先搞定简单的，有硬骨头随时喊我😂`,
          tactful:`全部帮可能顾不过来，但关键的地方我可以帮你。你先弄着，有需要随时找我。`,
          direct:`关键环节我能帮，剩下的你自己来。有难点找我。`,
        },
        date: {
          formal:`这个周末可能只有半天时间，我们可以先简单吃个饭？等忙完下周再好好安排一次完整的。`,
          humorous:`整天约会可能不行，但半天我还能挤出来！先吃个饭？下周忙完再安排个大的😂`,
          tactful:`这周末可能只有一点时间…我们先简单见个面好不好？等忙完下周好好安排。`,
          direct:`这周末只有半天空。先吃个饭，下周再好好约。`,
        },
        family: {
          formal:`全部处理可能没时间，但最关键的部分我先帮你弄好。剩下的等我忙完再回来处理。`,
          humorous:`全弄完不可能，但最急的我先帮你搞定！剩下的等我忙完回来😂`,
          tactful:`全部弄可能顾不过来，但最急的部分我先帮你处理。剩下的等我忙完再弄，好不好？`,
          direct:`最急的先帮你弄，剩下的等我忙完回来处理。`,
        },
        elder: {
          formal:`全部回来可能不行，但我可以先处理最要紧的部分。其余的等忙完这阵一定回来弄好。`,
          humorous:`全回来不行，但最要紧的我先给您办了！剩下的等我忙完回去😂`,
          tactful:`全部回来可能走不开…但最要紧的我先帮您处理。其余的等忙完一定回去，您别急。`,
          direct:`最要紧的先办，其余忙完回去处理。`,
        },
        acquaintance: {
          formal:`全部参与可能不太方便，但关键环节我可以帮忙。其余部分你看是否需要找其他人？`,
          humorous:`全包不行，但关键环节可以搭把手！其余的你自己搞定😂`,
          tactful:`这个…全部参与可能不太方便，但关键的地方我可以帮忙。你看行吗？`,
          direct:`关键环节可以帮，其余你自己安排。`,
        },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 感谢 ----
    gratitude(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: {
          formal:`${fillOpener(rel,sty,topic)}这次多亏了你帮忙，不然进度肯定受影响。改天请你喝咖啡！`,
          humorous:`${fillOpener(rel,sty,topic)}这次真的多亏你了！你就是我的"职场及时雨"😂 改天必须请你喝杯好的，不许拒绝！`,
          tactful:`${fillOpener(rel,sty,topic)}这次真的麻烦你了，帮了大忙。改天请你喝杯咖啡，算是小小心意。`,
          direct:`${fillOpener(rel,sty,topic)}谢了，帮大忙了。改天请你喝咖啡。`,
        },
        boss: {
          formal:`领导，${topic}这个项目能顺利推进，离不开您的指导和支持。感谢您的信任，后续我会继续努力。`,
          humorous:`领导，${topic}这事儿能成，全靠您运筹帷幄！我就是在前面跑腿的😂 感谢领导栽培！`,
          tactful:`领导，${topic}这边能顺利完成，多亏了您的支持和指导。非常感谢，后续我会继续加油。`,
          direct:`领导，${topic}顺利完成，感谢您的支持和指导。继续努力。`,
        },
        client: {
          formal:`非常感谢您对我们工作的认可和支持。${topic}这边我们会持续做好服务，有任何需求随时联系。`,
          humorous:`太感谢您的信任了！${topic}这边我们一定继续努力，不辜负您的期待😂 有任何问题随时找我！`,
          tactful:`您好，非常感谢您的支持。${topic}这边我们会持续跟进，确保您满意。有任何需要随时联系我。`,
          direct:`感谢您的信任和支持。${topic}我们会持续做好，有需求随时联系。`,
        },
        friend: {
          formal:`${fillOpener(rel,sty,topic)}这次真的谢了，帮了大忙。改天请你吃饭！`,
          humorous:`${fillOpener(rel,sty,topic)}这次多亏了你！你就是我的"中国好兄弟/闺蜜"😂 下次吃饭我请，不许跟我抢！`,
          tactful:`${fillOpener(rel,sty,topic)}这次真的麻烦你了，谢谢你。改天我请你吃饭，好好谢谢你。`,
          direct:`${fillOpener(rel,sty,topic)}谢了兄弟/姐妹，改天请你吃饭。`,
        },
        date: {
          formal:`${fillOpener(rel,sty,topic)}谢谢你今天，我很开心。期待下次见面。`,
          humorous:`${fillOpener(rel,sty,topic)}今天超开心的！你真的太会安排了😂 下次换我来请你好不好？`,
          tactful:`${fillOpener(rel,sty,topic)}今天真的很开心…谢谢你。期待下次还能一起出来。`,
          direct:`${fillOpener(rel,sty,topic)}今天很开心，谢谢。下次我请你。`,
        },
        family: {
          formal:`${fillOpener(rel,sty,topic)}谢谢你们一直以来的支持，我会继续努力的。`,
          humorous:`${fillOpener(rel,sty,topic)}谢谢你们！你们就是我最坚强的后盾😂 我会继续加油的，放心！`,
          tactful:`${fillOpener(rel,sty,topic)}一直麻烦你们…真的很感谢。我会好好努力的。`,
          direct:`${fillOpener(rel,sty,topic)}谢谢，我会继续加油的。`,
        },
        elder: {
          formal:`${fillOpener(rel,sty,topic)}谢谢您的关心和帮助。您注意身体，有空我回去看您。`,
          humorous:`${fillOpener(rel,sty,topic)}谢谢您！有您在我就放心了😂 您注意身体，我忙完就回去看您！`,
          tactful:`${fillOpener(rel,sty,topic)}多亏了您…真的很感谢。您保重身体，有空我一定回去看您。`,
          direct:`${fillOpener(rel,sty,topic)}谢谢您，我会注意的。忙完回去看您。`,
        },
        acquaintance: {
          formal:`${fillOpener(rel,sty,topic)}这次多谢帮忙，改天请你喝咖啡！`,
          humorous:`${fillOpener(rel,sty,topic)}多谢多谢！你就是"及时雨"本人😂 改天请你喝咖啡！`,
          tactful:`${fillOpener(rel,sty,topic)}这次麻烦你了，谢谢你。改天有空请你喝杯咖啡。`,
          direct:`${fillOpener(rel,sty,topic)}谢了，改天请你喝咖啡。`,
        },
      };
      const B = {
        colleague: {
          formal:`特别感谢你在${topic}上的支持，你的专业和效率让我很受启发。以后有需要帮忙的随时找我。`,
          humorous:`说真的，你在${topic}上的水平我服了！以后有什么我能帮的尽管说，咱互帮互助😂`,
          tactful:`这次${topic}多亏了你的帮助，我很感激。以后你有需要帮忙的地方，随时找我。`,
          direct:`感谢你在${topic}上的帮助。以后有需要随时找我。`,
        },
        boss: {
          formal:`领导，感谢您在${topic}上给我的指导和机会，让我学到了很多。后续我会把经验运用到工作中，不辜负您的期望。`,
          humorous:`领导，${topic}这次真的学到很多！感觉自己又进化了😂 感谢您的指导，后续继续努力！`,
          tactful:`领导，${topic}这次多亏了您的指导，让我学到了很多。非常感谢，我会继续努力。`,
          direct:`领导，${topic}上学到很多，感谢指导。继续努力。`,
        },
        client: {
          formal:`感谢您在${topic}上的信任与配合。正是因为有您的支持，项目才能顺利推进。后续我们会继续保持高质量服务。`,
          humorous:`说真的，${topic}能这么顺利，多亏了您的配合！遇到好客户就是运气😂 后续我们继续努力！`,
          tactful:`您好，${topic}这边能顺利推进，离不开您的信任和配合。非常感谢，我们会继续做好服务。`,
          direct:`感谢您在${topic}上的信任与配合。后续继续做好服务。`,
        },
        friend: {
          formal:`谢谢你一直以来在${topic}上帮我的忙。能交到你这样的朋友真的很幸运。`,
          humorous:`说真的，有你在${topic}上帮忙，我少走了多少弯路！交到你这样的朋友我真是赚到了😂`,
          tactful:`这次${topic}真的很感谢你…有你这个朋友我真的很幸运。`,
          direct:`谢了，有你这个朋友真好。`,
        },
        date: {
          formal:`谢谢你一直以来的陪伴和关心，跟你在一起感觉很舒服。希望能继续走下去。`,
          humorous:`说真的，跟你在一起的时候特别开心！你就像我的"快乐源泉"😂 希望以后还能一直这样。`,
          tactful:`跟你在一起真的很舒服…谢谢你一直以来的陪伴。希望能继续这样下去。`,
          direct:`跟你在一起很开心，谢谢你的陪伴。希望继续走下去。`,
        },
        family: {
          formal:`谢谢你们一直以来的付出，在${topic}上给了我很多支持。我会好好珍惜。`,
          humorous:`说真的，你们在${topic}上帮了我太多了！我上辈子一定是做了好事才遇到你们😂 爱你们！`,
          tactful:`在${topic}上真的多亏了你们…谢谢你们一直以来的付出。我会好好珍惜。`,
          direct:`谢谢你们在${topic}上的支持。我会好好珍惜。`,
        },
        elder: {
          formal:`感谢您一直以来的关心和教导，在${topic}上给了我很多帮助。我会铭记在心。`,
          humorous:`您在${topic}上帮了我太多了！有您这样的长辈真的很幸福😂 我会铭记在心的！`,
          tactful:`在${topic}上多亏了您的帮助…真的很感谢。我会铭记在心的。`,
          direct:`感谢您在${topic}上的帮助。铭记在心。`,
        },
        acquaintance: {
          formal:`感谢你在${topic}上的帮忙，以后有需要找我的地方尽管说。`,
          humorous:`你在${topic}上帮了大忙！以后有用得着我的地方尽管说😂`,
          tactful:`这次${topic}多亏了你…以后有需要帮忙的随时找我。`,
          direct:`谢了，以后有需要随时找我。`,
        },
      };
      const C = {
        colleague: {
          formal:`想当面跟你说声谢谢，${topic}这次你的帮助对我很重要。改天中午一起吃饭，我请！`,
          humorous:`光打字谢你不够诚意！${topic}这事儿你必须让我请顿饭😂 改天中午走起，不许拒绝！`,
          tactful:`想当面跟你说声谢谢…${topic}这次真的帮了大忙。改天一起吃个饭吧，我请。`,
          direct:`当面谢你。${topic}帮大忙了，改天中午请你吃饭。`,
        },
        boss: {
          formal:`领导，想当面向您表达感谢。${topic}这次您的指导让我受益匪浅，后续我会用实际行动回报您的信任。`,
          humorous:`领导，光打字不够诚意！${topic}这事儿必须当面谢谢您😂 后续我一定更加努力，不辜负您的栽培！`,
          tactful:`领导，想当面向您道谢。${topic}这次真的多亏了您的指导，非常感谢。`,
          direct:`领导，当面道谢。${topic}受益匪浅，后续用结果说话。`,
        },
        client: {
          formal:`再次感谢您在${topic}上的信任。我们会在后续合作中继续提供优质服务，期待长期合作。`,
          humorous:`再次感谢您的信任！${topic}后续我们一定继续加油，争取做到让您"挑不出毛病"😂 期待长期合作！`,
          tactful:`您好，再次感谢您的信任。${topic}这边我们会继续做好，期待长期合作。`,
          direct:`再次感谢。${topic}后续继续提供优质服务，期待长期合作。`,
        },
        friend: {
          formal:`真心感谢你，${topic}这次你帮的忙我记在心里了。以后你的事就是我的事。`,
          humorous:`兄弟/姐妹，${topic}这次你帮的忙我记住了！以后你的事就是我的事，两肋插刀那种😂`,
          tactful:`真心谢谢你…${topic}这次帮的忙我记在心里了。以后你有事随时说。`,
          direct:`谢了，记住了。以后你的事就是我的事。`,
        },
        date: {
          formal:`真心想跟你说，认识你之后每天都很期待。谢谢你出现在我的生活里。`,
          humorous:`说真的，认识你之后我每天都在盼手机响😂 谢谢你出现在我的生活里！`,
          tactful:`想跟你说…认识你之后每天都很期待。谢谢你出现在我的生活里。`,
          direct:`认识你很开心。谢谢你出现在我生活里。`,
        },
        family: {
          formal:`真心感谢你们一直以来的付出。我会努力让你们放心，以后换我来照顾你们。`,
          humorous:`你们对我这么好，我以后一定好好孝敬你们！说到做到😂 爱你们！`,
          tactful:`真心谢谢你们…以后换我来照顾你们，不让你们操心。`,
          direct:`谢谢你们。以后换我照顾你们。`,
        },
        elder: {
          formal:`真心感谢您的教导和关心。我会努力做一个让您骄傲的孩子，以后好好孝敬您。`,
          humorous:`您对我这么好，我以后一定好好孝敬您！说到做到😂 您就等着享福吧！`,
          tactful:`真心感谢您…我会努力让您骄傲的，以后好好孝敬您。`,
          direct:`谢谢您。我会努力让您骄傲。`,
        },
        acquaintance: {
          formal:`真心感谢你在${topic}上的帮忙，以后有用得着我的地方尽管开口。`,
          humorous:`真心谢你！${topic}帮了大忙😂 以后有用得着我的地方尽管开口！`,
          tactful:`真心谢谢你…${topic}帮了大忙。以后有事随时找我。`,
          direct:`真心谢了。以后有事随时找我。`,
        },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 道歉 ----
    apology(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: {
          formal:`关于${topic}，确实是我的问题，没有及时沟通到位，给你造成了麻烦。以后我会注意及时同步信息，避免再出现这种情况。`,
          humorous:`关于${topic}，这次锅我背！谁让我没及时沟通呢😂 以后保证长记性，绝不再犯！要不要请你喝杯咖啡赔罪？`,
          tactful:`关于${topic}，这次确实是我的疏忽…给你添麻烦了，很抱歉。以后我会注意及时沟通，避免再出现这种情况。`,
          direct:`${topic}是我的问题，没及时沟通。抱歉，以后注意。`,
        },
        boss: {
          formal:`领导，关于${topic}，这次是我的失误，没有把控好进度/细节。我已经复盘了问题原因，后续会采取措施确保不再发生。给您添麻烦了，非常抱歉。`,
          humorous:`领导，${topic}这次确实是我没做好，锅我背！已经复盘了，保证下不为例😂 给您添麻烦了，非常抱歉！`,
          tactful:`领导，关于${topic}，这次确实是我的疏忽…没有把控好细节。我已经复盘了原因，后续会改进。非常抱歉给您添了麻烦。`,
          direct:`领导，${topic}是我的失误。已复盘，后续改进。抱歉。`,
        },
        client: {
          formal:`您好，关于${topic}，这次确实是我们没做好，给您带来了不便，非常抱歉。我们已经制定了改进方案，确保后续不再出现类似问题。感谢您的理解。`,
          humorous:`您好，${topic}这次确实是我们没做好，给您添麻烦了！已经制定了改进方案，保证下不为例😂 感谢您的包容和理解！`,
          tactful:`您好，关于${topic}，这次确实是我们做得不到位…给您添麻烦了，非常抱歉。我们会改进，确保后续做好。感谢您的理解。`,
          direct:`您好，${topic}是我们没做好。已制定改进方案。抱歉，感谢理解。`,
        },
        friend: {
          formal:`关于${topic}，这次是我的错，我不应该那样说/做。对不起，以后我会注意。`,
          humorous:`关于${topic}，这次是我的锅！我不应该那样😂 对不起啊兄弟/姐妹，以后保证注意！要不要请你吃饭赔罪？`,
          tactful:`关于${topic}，这次确实是我的不对…对不起，我不应该那样。以后我会注意的。`,
          direct:`${topic}是我的错，对不起。以后注意。`,
        },
        date: {
          formal:`关于${topic}，这次是我的问题，没有考虑到你的感受。对不起，以后我会更加注意。`,
          humorous:`关于${topic}，这次是我脑子短路了！没有考虑到你的感受😂 对不起嘛，以后保证多动脑子！请你喝奶茶赔罪好不好？`,
          tactful:`关于${topic}，这次确实是我的不对…没有考虑到你的感受。对不起，以后我会更加注意的。`,
          direct:`${topic}是我的问题，没考虑你的感受。对不起，以后注意。`,
        },
        family: {
          formal:`关于${topic}，这次是我做得不对，让你们担心了。对不起，以后我会注意的。`,
          humorous:`关于${topic}，这次是我做得不对！让你们操心了😂 对不起啊，以后保证注意！`,
          tactful:`关于${topic}，这次确实是我做得不对…让你们担心了。对不起，以后我会注意的。`,
          direct:`${topic}是我做得不对，对不起。以后注意。`,
        },
        elder: {
          formal:`关于${topic}，这次是我考虑不周，让您操心了。非常抱歉，以后我会注意的。您别生气了，注意身体。`,
          humorous:`关于${topic}，这次是我考虑不周！让您操心了😂 对不起啊，以后保证注意！您别生气了，气坏了身体不值当！`,
          tactful:`关于${topic}，这次确实是我考虑不周…让您操心了。非常抱歉，以后我会注意的。您别太担心。`,
          direct:`${topic}是我考虑不周，抱歉。以后注意。您别生气。`,
        },
        acquaintance: {
          formal:`关于${topic}，这次是我的问题，给你添麻烦了。对不起，以后会注意。`,
          humorous:`关于${topic}，这次是我的锅！给你添麻烦了😂 对不起啊，以后保证注意！`,
          tactful:`关于${topic}，这次确实是我的疏忽…给你添麻烦了。对不起，以后会注意。`,
          direct:`${topic}是我的问题，抱歉。以后注意。`,
        },
      };
      const B = {
        colleague: {
          formal:`我仔细想了一下${topic}的事，确实是我做得不到位。我已经想好了改进方式，你看这样处理可以吗？`,
          humorous:`我琢磨了一下${topic}的事，确实是我没做好😂 我已经想好补救方案了，你看看行不行？行的话我请你喝咖啡！`,
          tactful:`我仔细想了想${topic}的事…确实是我的问题。我已经想好了改进方式，你看这样可以吗？`,
          direct:`${topic}我想过了，是我的问题。这是改进方案，你看行吗？`,
        },
        boss: {
          formal:`领导，关于${topic}，我重新梳理了一下。问题出在执行环节，我已经制定了改进措施，后续按新标准执行，确保不再出现类似问题。`,
          humorous:`领导，${topic}的事我重新捋了一遍！问题找到了，改进方案也出来了😂 后续按新标准来，保证不翻车！`,
          tactful:`领导，关于${topic}，我重新梳理了一下…问题出在执行环节。改进措施已制定，后续按此执行。`,
          direct:`领导，${topic}问题已定位。改进措施已制定，后续按新标准执行。`,
        },
        client: {
          formal:`您好，关于${topic}，我们已经重新梳理了流程。问题原因和改进方案如下：原因已查明，改进措施已落地。后续严格按新流程执行，确保品质。再次抱歉给您带来的不便。`,
          humorous:`您好，${topic}的事我们重新捋了一遍！问题找到了，改进方案也出来了😂 后续保证按新流程来，绝不再犯！`,
          tactful:`您好，关于${topic}，我们重新梳理了流程…问题原因已查明，改进措施已落地。后续严格按新流程执行。再次抱歉。`,
          direct:`您好，${topic}原因已查明。改进措施已落地，后续按新流程执行。再次抱歉。`,
        },
        friend: {
          formal:`我想了很久${topic}的事，确实是我做得不对。我不该那样说/做，以后我会改。你还在生气吗？`,
          humorous:`我想了半天${topic}的事，越想越觉得是我不对😂 我不该那样，以后保证改！你还生气不？要不请你吃顿好的消消气？`,
          tactful:`我想了很久${topic}的事…确实是我做得不对。我不该那样，以后会改。你还在生气吗？`,
          direct:`${topic}想过了，是我不对。以后会改。还生气吗？`,
        },
        date: {
          formal:`我认真想了一下${topic}的事，确实是我没顾及你的感受。以后我会多站在你的角度想问题。你能原谅我吗？`,
          humorous:`我认真想了想${topic}的事，越想越觉得是我没脑子😂 以后保证多站在你的角度想！你能原谅我吗？请你喝奶茶好不好？`,
          tactful:`我认真想了想${topic}的事…确实是我没顾及你的感受。以后我会多站在你的角度想。你能原谅我吗？`,
          direct:`${topic}想过了，是我没顾及你的感受。以后会改。能原谅我吗？`,
        },
        family: {
          formal:`我想了很久${topic}的事，确实是我做得不对。以后我会多听你们的意见，不再那样了。你们别生气了。`,
          humorous:`我想了半天${topic}的事，越想越觉得是我不对😂 以后保证多听你们的！别生气了，生气伤身体！`,
          tactful:`我想了很久${topic}的事…确实是我做得不对。以后我会多听你们的意见。你们别生气了。`,
          direct:`${topic}想过了，是我不对。以后多听你们的。别生气了。`,
        },
        elder: {
          formal:`我想了很久${topic}的事，确实是我考虑不周。以后我会多听您的意见，不再任性了。您别生气了，注意身体。`,
          humorous:`我想了半天${topic}的事，越想越觉得是我不懂事😂 以后保证多听您的！您别生气了，气坏了不值当！`,
          tactful:`我想了很久${topic}的事…确实是我考虑不周。以后我会多听您的意见。您别生气了。`,
          direct:`${topic}想过了，是我考虑不周。以后多听您的。别生气了。`,
        },
        acquaintance: {
          formal:`我想了一下${topic}的事，确实是我的问题。以后会注意，不会再这样了。`,
          humorous:`我想了想${topic}的事，确实是我的锅😂 以后保证注意！`,
          tactful:`我想了想${topic}的事…确实是我的问题。以后会注意。`,
          direct:`${topic}想过了，是我的问题。以后注意。`,
        },
      };
      const C = {
        colleague: {
          formal:`关于${topic}，我真的很抱歉。希望不影响我们之间的合作关系，以后我会更加谨慎。如果有需要我补救的地方，请告诉我。`,
          humorous:`关于${topic}，我真的很抱歉！希望不影响咱们的革命友谊😂 以后保证更加谨慎。有要补救的你尽管说！`,
          tactful:`关于${topic}，我真的很抱歉…希望不影响我们之间的关系。以后我会更加谨慎，有需要补救的地方请告诉我。`,
          direct:`${topic}很抱歉。以后更加谨慎。需要补救的请告诉我。`,
        },
        boss: {
          formal:`领导，${topic}的事给您添麻烦了，非常抱歉。我会用实际行动弥补这次的失误，请您放心。`,
          humorous:`领导，${topic}的事给您添麻烦了！非常抱歉😂 我会用实际行动弥补的，您看我表现！`,
          tactful:`领导，${topic}的事给您添麻烦了…非常抱歉。我会用实际行动弥补这次的失误。`,
          direct:`领导，${topic}给您添麻烦了，抱歉。会用行动弥补。`,
        },
        client: {
          formal:`您好，关于${topic}，给您带来了不好的体验，我们深感抱歉。我们会用更好的服务来弥补，感谢您给予改进的机会。`,
          humorous:`您好，${topic}给您带来了不好的体验，非常抱歉！我们一定用更好的服务来弥补😂 感谢您给的机会！`,
          tactful:`您好，关于${topic}…给您带来了不好的体验，非常抱歉。我们会用更好的服务来弥补。感谢您的理解。`,
          direct:`您好，${topic}给您带来不好体验，抱歉。会用更好的服务弥补。感谢理解。`,
        },
        friend: {
          formal:`关于${topic}，我真的很抱歉，不想因为这件事影响我们的友谊。以后我会更加注意，你对我很重要。`,
          humorous:`关于${topic}，我真的很抱歉！咱们的友谊可不能因为这个受影响😂 以后保证注意，你对我很重要！`,
          tactful:`关于${topic}，我真的很抱歉…不想因为这件事影响我们的友谊。以后我会注意的，你对我很重要。`,
          direct:`${topic}很抱歉。不想影响我们的友谊。你对我很重要。`,
        },
        date: {
          formal:`关于${topic}，我真的很抱歉，不想因为这件事让你对我有不好的印象。以后我会更加用心，你对我来说很重要。`,
          humorous:`关于${topic}，我真的很抱歉！你可别因为这就把我"拉黑"了😂 以后保证更加用心，你对我来说很重要！`,
          tactful:`关于${topic}，我真的很抱歉…不想让你对我有不好的印象。以后我会更加用心的，你对我来说很重要。`,
          direct:`${topic}很抱歉。你对我来说很重要，以后更加用心。`,
        },
        family: {
          formal:`关于${topic}，我真的很抱歉，不想让你们伤心。以后我会更加懂事，你们对我来说最重要。`,
          humorous:`关于${topic}，我真的很抱歉！你们可别因为这就不要我了😂 以后保证更加懂事，你们对我最重要！`,
          tactful:`关于${topic}，我真的很抱歉…不想让你们伤心。以后我会更加懂事的，你们对我来说最重要。`,
          direct:`${topic}很抱歉。你们对我最重要，以后更加懂事。`,
        },
        elder: {
          formal:`关于${topic}，我真的很抱歉，不想让您失望。以后我会更加懂事，您的教导我会铭记在心。`,
          humorous:`关于${topic}，我真的很抱歉！您可别因为这就对我失望了😂 以后保证更加懂事，您的教导我记着呢！`,
          tactful:`关于${topic}，我真的很抱歉…不想让您失望。以后我会更加懂事的，您的教导我会铭记。`,
          direct:`${topic}很抱歉。以后更加懂事，铭记您的教导。`,
        },
        acquaintance: {
          formal:`关于${topic}，我真的很抱歉。希望不影响我们之间的关系，以后我会更加注意。`,
          humorous:`关于${topic}，我真的很抱歉！希望不影响咱们的关系😂 以后保证注意！`,
          tactful:`关于${topic}，我真的很抱歉…希望不影响我们之间的关系。以后会注意。`,
          direct:`${topic}很抱歉。以后注意。`,
        },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 请假 ----
    leave(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: {
          formal:`我${topic}需要请一天假，手头的工作我已经跟同事交接好了，紧急事项可以找TA。如果有需要我远程处理的，随时联系我。`,
          humorous:`我得请一天假${topic}😂 手头的活儿已经交接好了，有事找TA就行。要是天塌了就打电话给我，其他的事等我回来！`,
          tactful:`我${topic}想请一天假…手头工作已经交接好了，有紧急的事可以找TA。需要远程处理的我随时在线。`,
          direct:`${topic}请假一天。工作已交接，有事找TA。`,
        },
        boss: {
          formal:`领导，我${topic}需要请一天假，已将手头工作交接给同事，紧急事项可联系处理。如有需要我远程协助的，随时联系我。请您批准。`,
          humorous:`领导，我${topic}得请一天假！工作已经交接好了，保证不耽误😂 要是有人找我就给我打电话，其他的事等我回来处理！请您批准～`,
          tactful:`领导，我${topic}想请一天假…手头工作已经交接好了，紧急事项可以找TA。需要远程处理的我随时在线。请您批准。`,
          direct:`领导，${topic}请假一天。工作已交接，紧急事项联系TA。请您批准。`,
        },
        client: {
          formal:`您好，我${topic}需要请假一天，期间您的需求由我的同事负责跟进。如果有紧急情况，会第一时间处理。给您带来不便，敬请谅解。`,
          humorous:`您好，我${topic}得请一天假！期间您的需求由我的同事负责，保证不耽误😂 有紧急情况找TA就行，我回来第一时间跟进！`,
          tactful:`您好，我${topic}想请假一天…期间您的需求由同事跟进，有紧急情况可以找TA。给您带来不便，敬请谅解。`,
          direct:`您好，${topic}请假一天。期间由同事跟进您的需求。敬请谅解。`,
        },
        friend: {
          formal:`${topic}我得请个假，改天一定补上！`,
          humorous:`${topic}我得放个鸽子😂 改天一定补上，请你吃饭赔罪！`,
          tactful:`${topic}可能去不了了…改天一定补上，不好意思啊。`,
          direct:`${topic}去不了，改天。`,
        },
        date: {
          formal:`${topic}我临时有事去不了，改天我重新安排好不好？`,
          humorous:`${topic}我临时被事情绊住了😂 改天我重新安排，请你吃好的赔罪！`,
          tactful:`${topic}我临时有点事…去不了了，改天我重新安排好不好？`,
          direct:`${topic}临时有事，改天。`,
        },
        family: {
          formal:`${topic}我临时有事回不去了，改天一定回来。你们别担心。`,
          humorous:`${topic}我被事情绊住了回不去😂 改天一定回来！你们别担心！`,
          tactful:`${topic}我临时有点事…回不去了，改天一定回来。你们别担心。`,
          direct:`${topic}回不去，改天。别担心。`,
        },
        elder: {
          formal:`${topic}我临时有事过不去，改天一定回去看您。您别担心。`,
          humorous:`${topic}我被事情绊住了过不去😂 改天一定回去看您！您别担心！`,
          tactful:`${topic}我临时有点事…过不去了，改天一定回去看您。您别担心。`,
          direct:`${topic}过不去，改天回去看您。别担心。`,
        },
        acquaintance: {
          formal:`${topic}我临时有事去不了，改天再约。`,
          humorous:`${topic}我被事情绊住了😂 改天再约！`,
          tactful:`${topic}我临时有点事…去不了了，改天再约好不好？`,
          direct:`${topic}去不了，改天。`,
        },
      };
      const B = {
        colleague: {
          formal:`因为${topic}需要请假，时间大约X天。我已经把进度文档整理好了，接手的同事可以直接看。回来后我会第一时间跟进。`,
          humorous:`因为${topic}得请几天假😂 进度文档我整理好了，接手的同事照着来就行。等我回来请你们喝奶茶！`,
          tactful:`因为${topic}想请几天假…进度文档已经整理好了，接手的同事可以直接看。回来后第一时间跟进。`,
          direct:`${topic}请假X天。进度文档已整理，回来后跟进。`,
        },
        boss: {
          formal:`领导，因${topic}需要请假X天。期间工作已安排交接，如有紧急情况可电话联系我。请您批准。`,
          humorous:`领导，因${topic}得请几天假😂 工作安排好了，有天大的事打电话给我！请您批准～`,
          tactful:`领导，因${topic}想请几天假…工作已安排交接，紧急情况可电话联系。请您批准。`,
          direct:`领导，${topic}请假X天。工作已安排，紧急可电话联系。请批准。`,
        },
        client: {
          formal:`您好，因${topic}我需要请假X天。期间您的需求由同事全程跟进，已了解您的项目情况。给您带来不便，敬请谅解。`,
          humorous:`您好，因${topic}我得请几天假😂 期间同事全程跟进您的需求，已经了解情况了。给我几天时间，回来马上跟进！`,
          tactful:`您好，因${topic}想请几天假…期间由同事跟进您的需求，已了解项目情况。敬请谅解。`,
          direct:`您好，${topic}请假X天。期间由同事跟进。敬请谅解。`,
        },
        friend: {
          formal:`因为${topic}这次去不了，真的很遗憾。等我忙完一定找你补上。`,
          humorous:`因为${topic}这次去不了了😂 等我忙完一定找你补上，请你吃饭！`,
          tactful:`因为${topic}这次可能去不了了…真的很遗憾，等我忙完找你补上。`,
          direct:`${topic}去不了。忙完找你补上。`,
        },
        date: {
          formal:`因为${topic}这次去不了，真的很抱歉。等我忙完重新安排，一定给你一个更好的。`,
          humorous:`因为${topic}这次去不了了😂 等我忙完重新安排一个更好的！请你吃好的赔罪！`,
          tactful:`因为${topic}这次可能去不了了…很抱歉，等我忙完重新安排好不好？`,
          direct:`${topic}去不了。忙完重新安排。`,
        },
        family: {
          formal:`因为${topic}这次回不去了，等我忙完一定回来。你们先照顾好自己。`,
          humorous:`因为${topic}这次回不去了😂 等我忙完一定回来！你们先照顾好自己！`,
          tactful:`因为${topic}这次可能回不去了…等我忙完一定回来。你们先照顾好自己。`,
          direct:`${topic}回不去。忙完回来。你们照顾好自己。`,
        },
        elder: {
          formal:`因为${topic}这次过不去了，等忙完一定回去看您。您注意身体。`,
          humorous:`因为${topic}这次过不去了😂 等忙完一定回去看您！您注意身体！`,
          tactful:`因为${topic}这次可能过不去了…等忙完一定回去看您。您注意身体。`,
          direct:`${topic}过不去。忙完回去看您。注意身体。`,
        },
        acquaintance: {
          formal:`因为${topic}这次去不了，下次再约。`,
          humorous:`因为${topic}这次去不了了😂 下次再约！`,
          tactful:`因为${topic}这次可能去不了了…下次再约好不好？`,
          direct:`${topic}去不了。下次再约。`,
        },
      };
      const C = {
        colleague: {
          formal:`${topic}的事处理完我会尽快回来。如果有特别紧急的情况，可以打我电话，我尽量协调处理。`,
          humorous:`${topic}的事处理完我火速回来！要是特别紧急就打电话给我😂 虽然我可能在忙，但你的事我优先！`,
          tactful:`${topic}的事处理完我会尽快回来…如果有特别紧急的情况，可以打我电话。`,
          direct:`${topic}处理完尽快回来。紧急情况打电话。`,
        },
        boss: {
          formal:`领导，${topic}处理完我会第一时间回来上班。期间如有关键决策需要我参与的，可以电话联系。感谢您的理解。`,
          humorous:`领导，${topic}处理完我火速回来！😂 期间有关键决策需要我的就打电话，保证随叫随到！感谢理解！`,
          tactful:`领导，${topic}处理完我会尽快回来…期间如有关键决策需要我参与的，可以电话联系。感谢理解。`,
          direct:`领导，${topic}处理完尽快回来。关键决策可电话联系。感谢理解。`,
        },
        client: {
          formal:`您好，${topic}处理完我会第一时间恢复工作。期间如果有特别紧急的需求，同事会联系我协调处理。感谢您的理解。`,
          humorous:`您好，${topic}处理完我火速回来！😂 期间特别紧急的需求同事会联系我协调。感谢理解！`,
          tactful:`您好，${topic}处理完我会尽快恢复工作…期间特别紧急的需求，同事会联系我协调。感谢理解。`,
          direct:`您好，${topic}处理完尽快恢复工作。紧急需求同事会协调。感谢理解。`,
        },
        friend: {
          formal:`${topic}处理完我第一时间找你。不好意思啊，改天请你吃饭。`,
          humorous:`${topic}处理完我第一时间找你！😂 改天请你吃饭赔罪！`,
          tactful:`${topic}处理完我第一时间找你…不好意思啊。`,
          direct:`${topic}处理完找你。改天请你吃饭。`,
        },
        date: {
          formal:`${topic}处理完我第一时间联系你。不好意思，改天我重新安排。`,
          humorous:`${topic}处理完我第一时间联系你！😂 改天重新安排，请你吃好的！`,
          tactful:`${topic}处理完我第一时间联系你…不好意思，改天重新安排好不好？`,
          direct:`${topic}处理完联系你。改天重新安排。`,
        },
        family: {
          formal:`${topic}处理完我尽快回来。你们先照顾好自己，别担心我。`,
          humorous:`${topic}处理完我火速回来！😂 你们先照顾好自己，别担心我！`,
          tactful:`${topic}处理完我尽快回来…你们先照顾好自己，别担心。`,
          direct:`${topic}处理完尽快回来。你们照顾好自己。`,
        },
        elder: {
          formal:`${topic}处理完我尽快回去看您。您注意身体，别担心我。`,
          humorous:`${topic}处理完我火速回去看您！😂 您注意身体，别担心我！`,
          tactful:`${topic}处理完我尽快回去看您…您注意身体，别担心。`,
          direct:`${topic}处理完尽快回去看您。注意身体。`,
        },
        acquaintance: {
          formal:`${topic}处理完我联系你。下次再约。`,
          humorous:`${topic}处理完我联系你！😂 下次再约！`,
          tactful:`${topic}处理完我联系你…下次再约。`,
          direct:`${topic}处理完联系你。下次再约。`,
        },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 汇报 ----
    report(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: {
          formal:`关于${topic}，同步一下进展：目前已完成XX，正在进行XX，预计X月X日完成。需要你配合的部分是XX，麻烦你了。`,
          humorous:`关于${topic}，播报一下进度😂 已完成XX，正在搞XX，预计X日搞定。需要你搭把手的地方是XX，拜托啦！`,
          tactful:`关于${topic}，跟你说一下进展…目前已完成XX，正在进行XX，预计X日完成。需要你帮忙的部分是XX，麻烦了。`,
          direct:`${topic}进展：已完成XX，进行中XX，预计X日完成。需要你配合：XX。`,
        },
        boss: {
          formal:`领导，关于${topic}向您汇报：1. 已完成：XX 2. 进行中：XX（预计X日完成）3. 待解决：XX。整体进度正常，有变化会及时同步。`,
          humorous:`领导，${topic}进度播报！😂 1. 已搞定：XX 2. 正在搞：XX（X日完成）3. 需要您拍板的：XX。整体没翻车，有情况随时报告！`,
          tactful:`领导，关于${topic}汇报一下…1. 已完成：XX 2. 进行中：XX（预计X日完成）3. 待解决：XX。整体进度正常。`,
          direct:`领导，${topic}汇报：1. 已完成XX 2. 进行中XX（X日完成）3. 待解决XX。进度正常。`,
        },
        client: {
          formal:`您好，关于${topic}同步一下进展：目前已完成XX，正在进行XX，预计X日交付。整体进度符合预期，有变化会第一时间通知您。`,
          humorous:`您好！${topic}进度播报来啦😂 已完成XX，正在搞XX，X日交付。整体顺利，有情况第一时间通知您！`,
          tactful:`您好，关于${topic}同步一下进展…目前已完成XX，正在进行XX，预计X日交付。整体符合预期。`,
          direct:`您好，${topic}进展：已完成XX，进行中XX，X日交付。进度符合预期。`,
        },
        friend: { formal:`${topic}的事跟你说一下，目前进展XX，基本搞定了。`, humorous:`${topic}的事跟你说下😂 基本搞定了，就差最后收尾！`, tactful:`${topic}的事跟你说一下…目前进展XX，基本搞定了。`, direct:`${topic}进展XX，基本搞定。` },
        date: { formal:`${topic}的事跟你说一下，目前进展顺利，基本完成了。`, humorous:`${topic}的事跟你说下😂 基本搞定了！感觉自己棒棒的！`, tactful:`${topic}的事跟你说一下…进展顺利，基本完成了。`, direct:`${topic}基本搞定了。` },
        family: { formal:`${topic}的事跟你们说一下，目前进展顺利，你们放心。`, humorous:`${topic}的事跟你们说一下😂 搞定了！你们放心！`, tactful:`${topic}的事跟你们说一下…进展顺利，你们放心。`, direct:`${topic}进展顺利，放心。` },
        elder: { formal:`${topic}的事跟您汇报一下，目前进展顺利，您放心。`, humorous:`${topic}的事跟您汇报一下😂 搞定了！您放心！`, tactful:`${topic}的事跟您汇报一下…进展顺利，您放心。`, direct:`${topic}进展顺利，您放心。` },
        acquaintance: { formal:`${topic}的事同步一下，目前进展XX，基本顺利。`, humorous:`${topic}的事同步一下😂 基本搞定了！`, tactful:`${topic}的事同步一下…进展XX，基本顺利。`, direct:`${topic}进展XX，基本顺利。` },
      };
      const B = {
        colleague: {
          formal:`${topic}这边有一个需要确认的点：XX。你看是选方案A还是方案B？我建议方案A，因为XX。你确认后我就继续推进。`,
          humorous:`${topic}这边有个选择题😂 方案A还是B？我投A，因为XX。你拍个板我就继续搞！`,
          tactful:`${topic}这边有个需要确认的点…XX。你看选方案A还是B？我建议A，因为XX。你确认后我继续推进。`,
          direct:`${topic}需确认：方案A还是B？建议A。确认后继续推进。`,
        },
        boss: {
          formal:`领导，${topic}有一个事项需要您决策：关于XX，方案A的优点是XX但成本较高，方案B的优点是XX但周期较长。我建议选方案A，理由是XX。请您指示。`,
          humorous:`领导，${topic}有个需要您拍板的😂 方案A好处是XX但费钱，方案B好处是XX但费时。我投A，因为XX。您定夺！`,
          tactful:`领导，${topic}有个事项需要您决策…关于XX，方案A优点是XX但成本高，方案B优点是XX但周期长。建议选A，理由XX。请您指示。`,
          direct:`领导，${topic}需决策：方案A（优点XX，成本高）vs 方案B（优点XX，周期长）。建议A。请指示。`,
        },
        client: {
          formal:`您好，关于${topic}有一个事项想跟您确认：XX。我们建议选方案A，因为XX。您看是否同意？确认后我们立即推进。`,
          humorous:`您好！${topic}有个需要您确认的😂 方案A还是B？我们建议A，因为XX。您拍个板我们就继续搞！`,
          tactful:`您好，关于${topic}有个事项想确认…XX。建议选方案A，因为XX。您看可以吗？确认后立即推进。`,
          direct:`您好，${topic}需确认：建议方案A，因为XX。您同意后立即推进。`,
        },
        friend: { formal:`${topic}有个事想问你，XX你觉得怎么样？`, humorous:`${topic}有个事想问你😂 XX你觉得咋样？帮我参谋参谋！`, tactful:`${topic}有个事想问你…XX你觉得怎么样？`, direct:`${topic}：XX你觉得怎么样？` },
        date: { formal:`${topic}有个事想跟你商量，你觉得怎么样？`, humorous:`${topic}有个事想跟你商量😂 你帮我参谋参谋呗！`, tactful:`${topic}有个事想跟你商量…你觉得怎么样？`, direct:`${topic}：你觉得怎么样？` },
        family: { formal:`${topic}有个事想跟你们商量，你们觉得怎么样？`, humorous:`${topic}有个事想跟你们商量😂 你们帮我参谋参谋！`, tactful:`${topic}有个事想跟你们商量…你们觉得怎么样？`, direct:`${topic}：你们觉得怎么样？` },
        elder: { formal:`${topic}有个事想跟您商量，您觉得怎么样？`, humorous:`${topic}有个事想跟您商量😂 您帮我参谋参谋！`, tactful:`${topic}有个事想跟您商量…您觉得怎么样？`, direct:`${topic}：您觉得怎么样？` },
        acquaintance: { formal:`${topic}有个事想问你，你觉得怎么样？`, humorous:`${topic}有个事想问你😂 你觉得咋样？`, tactful:`${topic}有个事想问你…你觉得怎么样？`, direct:`${topic}：你觉得怎么样？` },
      };
      const C = {
        colleague: {
          formal:`${topic}整体进度已过半，预计X日可以完成。过程中遇到了XX问题，已经解决了。后续如果顺利的话，可能会提前完成。`,
          humorous:`${topic}进度过半啦😂 中间遇到个小坑但已经填上了。顺利的话可能提前搞定！`,
          tactful:`${topic}整体进度过半了…预计X日完成。中间遇到XX问题，已经解决了。`,
          direct:`${topic}进度过半，预计X日完成。XX问题已解决。`,
        },
        boss: {
          formal:`领导，${topic}整体进度已过半，预计X日完成。过程中遇到一个风险点：XX，已采取措施应对。目前风险可控，后续有变化及时向您汇报。`,
          humorous:`领导，${topic}进度过半！😂 中间遇到个小风险但已经搞定了，目前可控。后续有情况随时报告！`,
          tactful:`领导，${topic}整体进度过半…预计X日完成。过程中遇到一个风险点XX，已采取措施应对，目前可控。`,
          direct:`领导，${topic}进度过半，X日完成。风险点XX已应对，可控。`,
        },
        client: {
          formal:`您好，${topic}整体进度已过半，预计X日交付。过程中我们优化了XX，效果不错。目前进展顺利，有变化会第一时间通知您。`,
          humorous:`您好！${topic}进度过半啦😂 中间还优化了一个点，效果不错！顺利的话可能提前交付！`,
          tactful:`您好，${topic}整体进度过半…预计X日交付。过程中优化了XX，效果不错。进展顺利。`,
          direct:`您好，${topic}进度过半，X日交付。已优化XX。进展顺利。`,
        },
        friend: { formal:`${topic}进度过半了，应该没问题。`, humorous:`${topic}进度过半了😂 稳得很！`, tactful:`${topic}进度过半了…应该没问题。`, direct:`${topic}过半了，没问题。` },
        date: { formal:`${topic}的事进度过半了，应该没问题。`, humorous:`${topic}进度过半了😂 稳了！`, tactful:`${topic}的事进度过半了…应该没问题。`, direct:`${topic}过半了，没问题。` },
        family: { formal:`${topic}进度过半了，你们放心。`, humorous:`${topic}进度过半了😂 稳了！放心！`, tactful:`${topic}进度过半了…你们放心。`, direct:`${topic}过半了，放心。` },
        elder: { formal:`${topic}进度过半了，您放心。`, humorous:`${topic}进度过半了😂 稳了！您放心！`, tactful:`${topic}进度过半了…您放心。`, direct:`${topic}过半了，您放心。` },
        acquaintance: { formal:`${topic}进度过半了，应该没问题。`, humorous:`${topic}进度过半了😂 稳了！`, tactful:`${topic}进度过半了…应该没问题。`, direct:`${topic}过半了，没问题。` },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 催促 ----
    followup(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: {
          formal:`关于${topic}，想跟进一下进度。你看大概什么时候能完成？如果有困难可以跟我说，我看看能不能协调。`,
          humorous:`关于${topic}，来催催进度了😂 不是催你啊，就是问问大概什么时候能搞定？有困难吱一声，我看看能不能搭把手！`,
          tactful:`关于${topic}，想问一下进度…你看大概什么时候能完成？如果有困难可以跟我说。`,
          direct:`${topic}进度怎么样了？大概什么时候能完成？`,
        },
        boss: {
          formal:`领导，关于${topic}想跟进一下，请问目前进展如何？如果需要我配合的地方请告知。`,
          humorous:`领导，${topic}这边我来跟进一下😂 请问进展如何？需要我配合的地方随时说！`,
          tactful:`领导，关于${topic}想跟进一下…请问目前进展如何？需要我配合的请告知。`,
          direct:`领导，${topic}进展如何？需要我配合请告知。`,
        },
        client: {
          formal:`您好，关于${topic}跟进一下。我们这边已经准备好了，等您那边确认后就可以推进。请问大概什么时候方便？`,
          humorous:`您好！${topic}这边来跟进一下😂 我们已经准备好了，就等您确认啦！请问大概什么时候方便？`,
          tactful:`您好，关于${topic}跟进一下…我们这边准备好了，等您确认后就可以推进。请问大概什么时候方便？`,
          direct:`您好，${topic}我们已准备好，等您确认。请问何时方便？`,
        },
        friend: { formal:`${topic}怎么样了？有点急，方便的话尽快给我个信。`, humorous:`${topic}咋样了😂 有点急，兄弟/姐妹帮个忙尽快给我个信！`, tactful:`${topic}怎么样了…有点急，方便的话尽快给我个信。`, direct:`${topic}怎么样了？有点急，尽快回我。` },
        date: { formal:`${topic}你想得怎么样了？不用有压力，就是想了解一下你的想法。`, humorous:`${topic}你想好了没😂 不催你不催你，就是有点好奇你的想法！`, tactful:`${topic}你想得怎么样了…不用有压力，就是想了解一下。`, direct:`${topic}想好了吗？` },
        family: { formal:`${topic}怎么样了？有点急，你们尽快处理一下。`, humorous:`${topic}咋样了😂 有点急，帮忙尽快弄一下！`, tactful:`${topic}怎么样了…有点急，方便的话尽快处理一下。`, direct:`${topic}怎么样了？有点急，尽快处理。` },
        elder: { formal:`${topic}怎么样了？有点着急，麻烦您尽快处理一下。`, humorous:`${topic}咋样了😂 有点急，麻烦您尽快弄一下！`, tactful:`${topic}怎么样了…有点着急，麻烦您尽快处理一下。`, direct:`${topic}怎么样了？有点急，麻烦尽快处理。` },
        acquaintance: { formal:`${topic}怎么样了？有点急，方便的话尽快给我个回复。`, humorous:`${topic}咋样了😂 有点急，帮忙尽快回个信！`, tactful:`${topic}怎么样了…有点急，方便的话尽快回复。`, direct:`${topic}怎么样了？有点急，尽快回复。` },
      };
      const B = {
        colleague: {
          formal:`打扰一下，${topic}这个事项比较紧急，上面在催。你看今天下班前能不能给我一个反馈？`,
          humorous:`打扰一下！${topic}有点急，上面在催了😂 你看今天下班前能不能给我个信？拜托拜托！`,
          tactful:`打扰一下…${topic}这个事项比较紧急，你看今天下班前能不能给个反馈？`,
          direct:`${topic}比较紧急，今天下班前给我反馈。`,
        },
        boss: {
          formal:`领导，${topic}这个事项客户在催，请问目前进展如何？如果需要我协调的地方请告知。`,
          humorous:`领导，${topic}客户在催了😂 请问进展如何？需要我协调的随时说！`,
          tactful:`领导，${topic}这个事项客户在催…请问目前进展如何？需要我协调的请告知。`,
          direct:`领导，${topic}客户在催。进展如何？需要协调请告知。`,
        },
        client: {
          formal:`您好，关于${topic}再次跟进一下。因为涉及后续排期，想确认一下您那边的进度。如果有什么困难，我们可以一起协商解决。`,
          humorous:`您好！${topic}再次跟进一下😂 因为涉及后续排期，想确认下您的进度。有困难咱一起想办法！`,
          tactful:`您好，关于${topic}再次跟进…因为涉及后续排期，想确认一下进度。有困难可以一起协商。`,
          direct:`您好，${topic}涉及后续排期，请确认进度。有困难可协商。`,
        },
        friend: { formal:`兄弟/姐妹，${topic}真的有点急，帮个忙尽快给我个信。改天请你吃饭！`, humorous:`兄弟/姐妹！${topic}真急了😂 尽快给我个信！改天请你吃饭！`, tactful:`那个…${topic}真的有点急，尽快给我个信好不好？改天请你吃饭！`, direct:`${topic}很急，尽快回复。改天请你吃饭。` },
        date: { formal:`${topic}有点想尽快知道你的想法，因为涉及到后续安排。不用有压力，但希望你能尽快给我个信。`, humorous:`${topic}有点想尽快知道你的想法😂 因为要安排后面的计划嘛。不催你不催你，但尽快给我个信呗？`, tactful:`${topic}有点想尽快知道你的想法…因为涉及后续安排。不用有压力，但希望尽快给我个信。`, direct:`${topic}需要尽快知道你的想法，涉及后续安排。` },
        family: { formal:`${topic}真的有点急，帮忙尽快处理一下。谢谢了！`, humorous:`${topic}真急了😂 帮忙尽快弄一下！谢了！`, tactful:`${topic}真的有点急…帮忙尽快处理一下好不好？谢谢了。`, direct:`${topic}很急，尽快处理。谢谢。` },
        elder: { formal:`${topic}有点着急，麻烦您尽快处理一下。辛苦您了。`, humorous:`${topic}有点急了😂 麻烦您尽快弄一下！辛苦您了！`, tactful:`${topic}有点着急…麻烦您尽快处理一下。辛苦您了。`, direct:`${topic}有点急，麻烦尽快处理。辛苦了。` },
        acquaintance: { formal:`${topic}有点急，帮忙尽快给我个回复。谢谢了！`, humorous:`${topic}有点急了😂 帮忙尽快回个信！谢了！`, tactful:`${topic}有点急…帮忙尽快回复好不好？谢谢了。`, direct:`${topic}有点急，尽快回复。谢谢。` },
      };
      const C = {
        colleague: {
          formal:`${topic}如果暂时有困难，可以告诉我，我看看能不能调整方案或者协调其他人帮忙。不用有压力，沟通清楚就好。`,
          humorous:`${topic}要是遇到困难了别硬扛😂 告诉我，咱一起想办法。调整方案也好，找人帮忙也好，沟通清楚就行！`,
          tactful:`${topic}如果暂时有困难…可以告诉我，我看看能不能调整方案或协调帮忙。不用有压力。`,
          direct:`${topic}有困难告诉我，可以调整方案或协调帮忙。`,
        },
        boss: {
          formal:`领导，${topic}如果推进有困难，我可以协助协调资源或调整方案。请您指示是否需要调整策略。`,
          humorous:`领导，${topic}如果有困难我可以帮忙协调😂 资源、方案都可以调整，您说怎么弄就怎么弄！`,
          tactful:`领导，${topic}如果推进有困难…我可以协助协调资源或调整方案。请您指示。`,
          direct:`领导，${topic}如有困难，我可协调资源或调整方案。请指示。`,
        },
        client: {
          formal:`您好，关于${topic}，如果您那边遇到困难，我们可以一起协商调整方案。我们的目标是确保您满意，时间节点可以灵活调整。`,
          humorous:`您好！${topic}要是遇到困难了咱一起想办法😂 方案可以调，时间可以挪，目标是让您满意！`,
          tactful:`您好，关于${topic}…如果遇到困难，我们可以一起协商调整方案。目标确保您满意。`,
          direct:`您好，${topic}有困难可协商调整。目标确保您满意。`,
        },
        friend: { formal:`${topic}如果搞不定可以跟我说，咱一起想办法。别一个人扛着。`, humorous:`${topic}搞不定就说！咱一起想办法😂 别一个人扛着，那多没意思！`, tactful:`${topic}如果搞不定…可以跟我说，咱一起想办法。别一个人扛着。`, direct:`${topic}搞不定告诉我，一起想办法。` },
        date: { formal:`${topic}如果还没想好也没关系，不着急。你可以慢慢想，我等你的消息。`, humorous:`${topic}没想好也没关系😂 不着急，慢慢想！我等你消息，又不是要跑了！`, tactful:`${topic}如果还没想好…也没关系，不着急。你可以慢慢想，我等你消息。`, direct:`${topic}没想好没关系，不着急。等你消息。` },
        family: { formal:`${topic}如果搞不定可以跟我说，咱一起想办法。别着急。`, humorous:`${topic}搞不定就说！咱一起想办法😂 别着急！`, tactful:`${topic}如果搞不定…可以跟我说，咱一起想办法。别着急。`, direct:`${topic}搞不定告诉我，一起想办法。` },
        elder: { formal:`${topic}如果搞不定可以跟我说，我来想办法。您别着急。`, humorous:`${topic}搞不定就告诉我！我来想办法😂 您别着急！`, tactful:`${topic}如果搞不定…可以跟我说，我来想办法。您别着急。`, direct:`${topic}搞不定告诉我。您别着急。` },
        acquaintance: { formal:`${topic}如果有困难可以告诉我，看看能不能一起想办法。`, humorous:`${topic}有困难就说！看看能不能一起想办法😂`, tactful:`${topic}如果有困难…可以告诉我，看看能不能一起想办法。`, direct:`${topic}有困难告诉我，一起想办法。` },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 邀约 ----
    invitation(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: { formal:`最近忙了一阵，想约你吃个饭${topic}，顺便聊一下。你这周哪天比较方便？`, humorous:`忙了一阵了，该补充能量了！约你吃个饭${topic}😂 顺便聊聊。这周哪天有空？`, tactful:`最近忙了一阵…想约你吃个饭${topic}，顺便聊一下。你这周哪天方便？`, direct:`约你吃饭${topic}，这周哪天有空？` },
        boss: { formal:`领导，想请您吃个饭${topic}，感谢您这段时间的指导。您看这周哪天方便？`, humorous:`领导，该请您吃个饭了${topic}😂 感谢您这段时间的指导！您看这周哪天方便？`, tactful:`领导，想请您吃个饭${topic}…感谢您这段时间的指导。您看这周哪天方便？`, direct:`领导，想请您吃饭${topic}，这周哪天方便？` },
        client: { formal:`您好，想约您见个面${topic}，聊一下后续合作的方向。您看这周哪天比较方便？`, humorous:`您好！想约您见个面${topic}😂 聊聊后续合作。您看这周哪天方便？`, tactful:`您好，想约您见个面${topic}…聊一下后续合作方向。您看这周哪天方便？`, direct:`您好，想约您见面${topic}聊合作，这周哪天方便？` },
        friend: { formal:`好久没聚了，约你出来${topic}。这周末有空吗？`, humorous:`好久没聚了！约你出来${topic}😂 这周末有空没？出来嗨！`, tactful:`好久没聚了…想约你出来${topic}。这周末有空吗？`, direct:`出来聚聚${topic}，这周末有空吗？` },
        date: { formal:`想约你出来${topic}，有一家不错的店想带你去。这周末你有空吗？`, humorous:`发现一家超棒的店！想带你去${topic}😂 这周末有空吗？保证不会让你失望！`, tactful:`想约你出来${topic}…有一家不错的店想带你去。这周末你有空吗？`, direct:`约你${topic}，发现一家不错的店。这周末有空吗？` },
        family: { formal:`好久没回去了，这周末想回去看你们${topic}。你们在家吗？`, humorous:`好久没回去了！这周末回去看你们${topic}😂 你们在家不？`, tactful:`好久没回去了…这周末想回去看你们${topic}。你们在家吗？`, direct:`这周末回去看你们${topic}，在家吗？` },
        elder: { formal:`好久没去看您了，这周末想回去看您${topic}。您在家吗？`, humorous:`好久没去看您了！这周末回去看您${topic}😂 您在家不？`, tactful:`好久没去看您了…这周末想回去看您${topic}。您在家吗？`, direct:`这周末回去看您${topic}，在家吗？` },
        acquaintance: { formal:`好久没见了，想约你出来${topic}聚聚。这周末方便吗？`, humorous:`好久没见了！约你出来${topic}聚聚😂 这周末方便不？`, tactful:`好久没见了…想约你出来${topic}聚聚。这周末方便吗？`, direct:`出来聚聚${topic}，这周末方便吗？` },
      };
      const B = {
        colleague: { formal:`我发现一家新开的餐厅不错，想约你一起去尝尝${topic}。这周五下班后方便吗？`, humorous:`我发现一家新开的餐厅超赞！想约你去尝尝${topic}😂 这周五下班后走起？`, tactful:`我发现一家新开的餐厅不错…想约你去尝尝${topic}。这周五下班后方便吗？`, direct:`发现一家不错的餐厅，约你去${topic}。周五下班后方便吗？` },
        boss: { formal:`领导，最近发现一家不错的餐厅，想请您去尝尝${topic}。您看周五下班后方便吗？`, humorous:`领导，发现一家不错的餐厅！想请您去尝尝${topic}😂 周五下班后方便不？`, tactful:`领导，最近发现一家不错的餐厅…想请您去尝尝${topic}。您看周五下班后方便吗？`, direct:`领导，发现一家不错的餐厅，请您去${topic}。周五下班后方便吗？` },
        client: { formal:`您好，最近发现一家环境不错的餐厅，想约您一起坐坐${topic}，顺便聊聊合作。您看这周哪天方便？`, humorous:`您好！发现一家环境超好的餐厅，想约您坐坐${topic}😂 顺便聊聊合作。这周哪天方便？`, tactful:`您好，发现一家环境不错的餐厅…想约您坐坐${topic}，顺便聊聊合作。这周哪天方便？`, direct:`您好，发现一家不错的餐厅，约您坐坐${topic}。这周哪天方便？` },
        friend: { formal:`我发现一家新开的店，感觉你会喜欢。这周末一起去${topic}？`, humorous:`发现一家新开的店，感觉你会喜欢😂 这周末一起去${topic}？不去后悔！`, tactful:`我发现一家新开的店…感觉你会喜欢。这周末一起去${topic}？`, direct:`发现一家新店，感觉你会喜欢。周末一起去${topic}？` },
        date: { formal:`我发现一家氛围很好的咖啡馆，想带你去${topic}。这周末有空吗？`, humorous:`发现一家氛围超好的咖啡馆！想带你去${topic}😂 这周末有空没？保证出片！`, tactful:`我发现一家氛围很好的咖啡馆…想带你去${topic}。这周末有空吗？`, direct:`发现一家氛围好的咖啡馆，带你去${topic}。周末有空吗？` },
        family: { formal:`我订了一家不错的餐厅，想带你们去尝尝${topic}。这周末方便吗？`, humorous:`我订了一家不错的餐厅！带你们去尝尝${topic}😂 这周末方便不？`, tactful:`我订了一家不错的餐厅…想带你们去尝尝${topic}。这周末方便吗？`, direct:`订了一家不错的餐厅，带你们去${topic}。周末方便吗？` },
        elder: { formal:`我订了一家不错的餐厅，想带您去尝尝${topic}。这周末您方便吗？`, humorous:`我订了一家不错的餐厅！带您去尝尝${topic}😂 这周末方便不？`, tactful:`我订了一家不错的餐厅…想带您去尝尝${topic}。这周末您方便吗？`, direct:`订了一家不错的餐厅，带您去${topic}。周末方便吗？` },
        acquaintance: { formal:`我发现一家新开的店不错，想约你一起去${topic}。这周末方便吗？`, humorous:`发现一家新开的店不错！约你一起去${topic}😂 这周末方便不？`, tactful:`我发现一家新开的店不错…想约你一起去${topic}。这周末方便吗？`, direct:`发现一家新店，约你去${topic}。周末方便吗？` },
      };
      const C = {
        colleague: { formal:`${topic}的事想当面跟你聊，约个时间见面吧。你看这周哪天比较方便？`, humorous:`${topic}的事打字说不清楚，约个时间当面聊😂 你看这周哪天方便？`, tactful:`${topic}的事想当面跟你聊…约个时间见面吧。你看这周哪天方便？`, direct:`${topic}当面聊，这周哪天方便？` },
        boss: { formal:`领导，${topic}有几个想法想当面跟您汇报。您看这周哪天方便，我去找您？`, humorous:`领导，${topic}有几个想法想当面跟您聊聊😂 您看这周哪天方便？我去找您！`, tactful:`领导，${topic}有几个想法想当面汇报…您看这周哪天方便？`, direct:`领导，${topic}想当面汇报，这周哪天方便？` },
        client: { formal:`您好，关于${topic}有几个方案想当面跟您聊一下。您看这周哪天方便，我们约个时间？`, humorous:`您好！${topic}有几个方案想当面聊聊😂 您看这周哪天方便？咱约个时间！`, tactful:`您好，关于${topic}有几个方案想当面聊…您看这周哪天方便？`, direct:`您好，${topic}有方案想当面聊，这周哪天方便？` },
        friend: { formal:`${topic}当面的聊吧，约个时间出来。`, humorous:`${topic}当面聊！约个时间出来😂`, tactful:`${topic}当面聊吧…约个时间出来？`, direct:`${topic}当面聊，约时间。` },
        date: { formal:`${topic}当面聊比较好，约你出来见个面？`, humorous:`${topic}当面聊比较好！约你出来见个面😂？`, tactful:`${topic}当面聊比较好…约你出来见个面？`, direct:`${topic}当面聊，出来见面？` },
        family: { formal:`${topic}当面跟你们说吧，这周末回去。`, humorous:`${topic}当面说吧！这周末回去😂`, tactful:`${topic}当面跟你们说吧…这周末回去。`, direct:`${topic}当面说，周末回去。` },
        elder: { formal:`${topic}当面跟您说吧，这周末回去看您。`, humorous:`${topic}当面说吧！这周末回去看您😂`, tactful:`${topic}当面跟您说吧…这周末回去看您。`, direct:`${topic}当面说，周末回去看您。` },
        acquaintance: { formal:`${topic}当面聊吧，约个时间出来。`, humorous:`${topic}当面聊！约个时间出来😂`, tactful:`${topic}当面聊吧…约个时间出来？`, direct:`${topic}当面聊，约时间。` },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 祝福 ----
    greeting(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: { formal:`${topic}快乐！祝你在新的一岁/新的一年里工作顺利，万事如意。`, humorous:`${topic}快乐！祝你在新的一岁里升职加薪，走上人生巅峰😂 等你发达了别忘了请我吃饭！`, tactful:`${topic}快乐…祝你在新的一岁/新的一年里一切顺利，心想事成。`, direct:`${topic}快乐！工作顺利，万事如意。` },
        boss: { formal:`领导，${topic}快乐！感谢您一直以来的指导和栽培，祝您身体健康，工作顺利。`, humorous:`领导，${topic}快乐！感谢您的指导，祝您在新的一年里身体健康、万事如意😂 继续带领我们冲！`, tactful:`领导，${topic}快乐…感谢您一直以来的指导，祝您身体健康，工作顺利。`, direct:`领导，${topic}快乐！身体健康，工作顺利。` },
        client: { formal:`您好，${topic}快乐！感谢您一直以来的信任和支持，祝您事业蒸蒸日上，万事如意。`, humorous:`您好！${topic}快乐！感谢您的信任，祝您事业蒸蒸日上、财源滚滚😂 期待继续合作！`, tactful:`您好，${topic}快乐…感谢您一直以来的信任，祝您事业顺利，万事如意。`, direct:`您好，${topic}快乐！事业顺利，万事如意。` },
        friend: { formal:`${topic}快乐！祝你一切顺利，心想事成。`, humorous:`${topic}快乐！祝你新的一岁暴富暴美/帅，走路带风😂 有空出来聚！`, tactful:`${topic}快乐…祝你一切顺利，心想事成。`, direct:`${topic}快乐！一切顺利。` },
        date: { formal:`${topic}快乐！很高兴认识你，希望以后的日子里一直有你。`, humorous:`${topic}快乐！很高兴认识你😂 希望以后每个${topic}都能陪你一起过！`, tactful:`${topic}快乐…很高兴认识你，希望以后的日子里一直有你。`, direct:`${topic}快乐！很高兴认识你。` },
        family: { formal:`${topic}快乐！祝你们身体健康，万事如意。我爱你们。`, humorous:`${topic}快乐！祝你们身体健康，天天开心😂 爱你们！等我回去请你们吃饭！`, tactful:`${topic}快乐…祝你们身体健康，万事如意。我爱你们。`, direct:`${topic}快乐！身体健康。爱你们。` },
        elder: { formal:`${topic}快乐！祝您身体健康，福如东海，寿比南山。`, humorous:`${topic}快乐！祝您身体健康，笑口常开😂 等我回去好好陪您！`, tactful:`${topic}快乐…祝您身体健康，福如东海，寿比南山。`, direct:`${topic}快乐！身体健康，福如东海。` },
        acquaintance: { formal:`${topic}快乐！祝你一切顺利。`, humorous:`${topic}快乐！祝你一切顺利😂 有空聚！`, tactful:`${topic}快乐…祝你一切顺利。`, direct:`${topic}快乐！一切顺利。` },
      };
      const B = {
        colleague: { formal:`${topic}到了，想跟你说声感谢。这一年里多亏了你的帮助和支持，希望来年继续合作愉快。`, humorous:`${topic}到了！这一年多亏你照顾，在我心里你就是"最佳同事奖"得主😂 来年继续并肩作战！`, tactful:`${topic}到了…想跟你说声感谢。这一年多亏了你的帮助，希望来年继续合作愉快。`, direct:`${topic}到了，感谢这一年的帮助。来年继续合作。` },
        boss: { formal:`领导，${topic}之际，想向您表达感谢。这一年里在您的指导下收获很多，希望来年继续向您学习。`, humorous:`领导，${topic}到了！这一年跟您学到不少，在我心里您就是"最佳领导"😂 来年继续向您学习！`, tactful:`领导，${topic}之际…想向您表达感谢。这一年收获很多，希望来年继续学习。`, direct:`领导，${topic}之际，感谢指导。来年继续学习。` },
        client: { formal:`您好，${topic}之际，感谢您这一年来的信任与支持。期待来年继续合作，共创佳绩。`, humorous:`您好！${topic}到了，感谢这一年来的信任😂 在我心里您就是"最佳客户"！来年继续合作！`, tactful:`您好，${topic}之际…感谢这一年来的信任与支持。期待来年继续合作。`, direct:`您好，${topic}之际，感谢信任。期待来年合作。` },
        friend: { formal:`${topic}到了，感谢你一直以来的陪伴。你是我最重要的朋友，希望我们的友谊长长久久。`, humorous:`${topic}到了！感谢你一直陪着我😂 你就是我生命中的"最佳损友"！友谊长存！`, tactful:`${topic}到了…感谢你一直以来的陪伴。你是我最重要的朋友。`, direct:`${topic}到了，感谢陪伴。友谊长存。` },
        date: { formal:`${topic}到了，想跟你说，遇见你是今年最好的事。希望以后每个${topic}都有你在。`, humorous:`${topic}到了！遇见你是今年最大的收获😂 希望以后每个${topic}都有你在！`, tactful:`${topic}到了…想跟你说，遇见你是今年最好的事。希望以后都有你在。`, direct:`${topic}到了，遇见你是最好的事。希望以后都有你。` },
        family: { formal:`${topic}到了，想跟你们说声感谢。一直辛苦你们了，我会努力让你们骄傲。`, humorous:`${topic}到了！辛苦你们了😂 我会努力让你们骄傲的！爱你们！`, tactful:`${topic}到了…想跟你们说声感谢。一直辛苦你们了，我会努力的。`, direct:`${topic}到了，感谢你们。我会努力的。` },
        elder: { formal:`${topic}到了，感谢您一直以来的关心和教导。我会努力让您骄傲，您保重身体。`, humorous:`${topic}到了！感谢您一直的关心😂 我会努力让您骄傲的！您保重身体！`, tactful:`${topic}到了…感谢您一直以来的关心和教导。您保重身体。`, direct:`${topic}到了，感谢关心。您保重身体。` },
        acquaintance: { formal:`${topic}到了，感谢一直以来的关照。祝你一切顺利。`, humorous:`${topic}到了！感谢关照😂 祝你一切顺利！`, tactful:`${topic}到了…感谢一直以来的关照。祝你顺利。`, direct:`${topic}到了，感谢关照。一切顺利。` },
      };
      const C = {
        colleague: { formal:`${topic}快乐！新的一岁/新的一年，愿你前程似锦，万事胜意。有空一起吃饭！`, humorous:`${topic}快乐！新的一岁愿你升职加薪、脱单暴富😂 有空出来吃饭庆祝！`, tactful:`${topic}快乐…新的一岁，愿你前程似锦，万事胜意。有空一起吃饭。`, direct:`${topic}快乐！前程似锦。有空吃饭。` },
        boss: { formal:`领导，${topic}快乐！祝您在新的一年里事业更上一层楼，家庭幸福。感谢您的栽培。`, humorous:`领导，${topic}快乐！祝您事业更上一层楼、家庭幸福😂 感谢您的栽培！`, tactful:`领导，${topic}快乐…祝您事业更上一层楼，家庭幸福。感谢栽培。`, direct:`领导，${topic}快乐！事业更上一层楼。感谢栽培。` },
        client: { formal:`您好，${topic}快乐！祝您在新的一年里事业腾飞，万事顺遂。期待与您继续携手合作。`, humorous:`您好！${topic}快乐！祝您事业腾飞、万事顺遂😂 期待继续合作！`, tactful:`您好，${topic}快乐…祝您事业腾飞，万事顺遂。期待继续合作。`, direct:`您好，${topic}快乐！事业腾飞。期待继续合作。` },
        friend: { formal:`${topic}快乐！愿你新的一岁/新的一年里心想事成，快乐每一天。`, humorous:`${topic}快乐！愿你新的一岁心想事成、快乐每一天😂 有空出来嗨！`, tactful:`${topic}快乐…愿你心想事成，快乐每一天。`, direct:`${topic}快乐！心想事成。` },
        date: { formal:`${topic}快乐！愿以后的每一天都有好消息，希望你能一直开心。`, humorous:`${topic}快乐！愿你以后每天都有好消息😂 希望你能一直开心！`, tactful:`${topic}快乐…愿以后的每一天都有好消息，希望你一直开心。`, direct:`${topic}快乐！希望你一直开心。` },
        family: { formal:`${topic}快乐！愿你们身体健康，天天开心。我会常回去看你们的。`, humorous:`${topic}快乐！愿你们身体健康、天天开心😂 我会常回去看你们的！`, tactful:`${topic}快乐…愿你们身体健康，天天开心。我会常回去看你们。`, direct:`${topic}快乐！身体健康。我会常回去。` },
        elder: { formal:`${topic}快乐！愿您健康长寿，笑口常开。有空一定回去看您。`, humorous:`${topic}快乐！愿您健康长寿、笑口常开😂 有空一定回去看您！`, tactful:`${topic}快乐…愿您健康长寿，笑口常开。有空回去看您。`, direct:`${topic}快乐！健康长寿。有空回去看您。` },
        acquaintance: { formal:`${topic}快乐！愿你一切顺利，心想事成。`, humorous:`${topic}快乐！愿你一切顺利😂 心想事成！`, tactful:`${topic}快乐…愿你一切顺利。`, direct:`${topic}快乐！一切顺利。` },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 安慰 ----
    comfort(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: { formal:`听说你最近${topic}，辛苦了。如果需要帮忙的地方随时说，不用一个人扛。`, humorous:`听说你最近${topic}，辛苦了！别一个人扛着，有啥需要帮忙的尽管说😂 咱们是一个团队的！`, tactful:`听说你最近${topic}…辛苦了。如果需要帮忙随时说，不用一个人扛。`, direct:`${topic}辛苦了。需要帮忙随时说。` },
        boss: { formal:`领导，知道您最近${topic}比较辛苦。如果有什么我能分担的，请尽管安排。`, humorous:`领导，知道您最近${topic}比较辛苦！有啥我能分担的尽管安排😂 别一个人扛着！`, tactful:`领导，知道您最近${topic}…比较辛苦。如果有什么我能分担的，请尽管安排。`, direct:`领导，${topic}辛苦了。有需要分担的请安排。` },
        client: { formal:`您好，了解您最近${topic}的情况。请放心，我们会全力配合，确保不影响您的计划。`, humorous:`您好，了解您最近${topic}的情况！请放心，我们全力配合😂 绝不拖后腿！`, tactful:`您好，了解您最近${topic}…的情况。请放心，我们会全力配合。`, direct:`您好，了解${topic}情况。我们会全力配合。` },
        friend: { formal:`听说你最近${topic}，别太难过了。有什么想说的随时找我，我一直在。`, humorous:`听说你最近${topic}，别丧了！有什么想说的随时找我😂 我24小时在线，随叫随到！`, tactful:`听说你最近${topic}…别太难过了。有什么想说的随时找我，我一直在。`, direct:`${topic}别难过了。随时找我。` },
        date: { formal:`听说你最近${topic}，别太难过。如果你想聊聊，我随时都在。`, humorous:`听说你最近${topic}，别难过了！想聊聊随时找我😂 我保证当个好听众！`, tactful:`听说你最近${topic}…别太难过。如果想聊聊，我随时都在。`, direct:`${topic}别难过。想聊随时找我。` },
        family: { formal:`听说你最近${topic}，别太担心。一切都会好起来的，我们一直在你身边。`, humorous:`听说你最近${topic}，别担心！一切都会好起来的😂 我们一直在你身边！`, tactful:`听说你最近${topic}…别太担心。一切都会好起来的，我们在你身边。`, direct:`${topic}别担心。一切会好起来。我们在你身边。` },
        elder: { formal:`听说您最近${topic}，别太担心。一切都会好起来的，您注意身体。`, humorous:`听说您最近${topic}，别担心！一切都会好起来的😂 您注意身体！`, tactful:`听说您最近${topic}…别太担心。一切都会好起来的，您注意身体。`, direct:`${topic}别担心。一切会好起来。注意身体。` },
        acquaintance: { formal:`听说你最近${topic}，希望一切都能顺利。如果有需要帮忙的可以找我。`, humorous:`听说你最近${topic}，希望一切顺利！有需要帮忙的可以找我😂`, tactful:`听说你最近${topic}…希望一切顺利。有需要可以找我。`, direct:`${topic}希望一切顺利。有需要找我。` },
      };
      const B = {
        colleague: { formal:`${topic}这种事谁都会遇到，你已经做得很好了。别给自己太大压力，慢慢来。`, humorous:`${topic}这种事谁都会遇到！你已经做得很好了😂 别给自己太大压力，慢慢来！`, tactful:`${topic}这种事谁都会遇到…你已经做得很好了。别给自己太大压力。`, direct:`${topic}你已经做得很好了。别给自己太大压力。` },
        boss: { formal:`领导，${topic}这种事很常见，您已经处理得很好了。后续如果有需要我协助的，请随时安排。`, humorous:`领导，${topic}这种事很常见！您已经处理得很好了😂 后续有需要我协助的随时说！`, tactful:`领导，${topic}这种事很常见…您已经处理得很好了。后续有需要协助的请安排。`, direct:`领导，${topic}您处理得很好。后续需要协助请安排。` },
        client: { formal:`您好，${topic}这种事时有发生，不全是您的责任。我们会一起想办法解决，请您放心。`, humorous:`您好，${topic}这种事时有发生！不全是您的责任😂 我们一起想办法解决，放心！`, tactful:`您好，${topic}这种事时有发生…不全是您的责任。我们会一起解决。`, direct:`您好，${topic}不全是您的责任。我们一起解决。` },
        friend: { formal:`${topic}这种事谁都会遇到，你已经做得很好了。别太难为自己，我永远支持你。`, humorous:`${topic}这种事谁都会遇到！你已经做得很好了😂 别太难为自己，我永远站你这边！`, tactful:`${topic}这种事谁都会遇到…你已经做得很好了。别太难为自己，我支持你。`, direct:`${topic}你已经做得很好了。我支持你。` },
        date: { formal:`${topic}这种事很正常，别太放在心上。你已经很棒了，我看好你。`, humorous:`${topic}这种事很正常！别太放在心上😂 你已经很棒了，我看好你！`, tactful:`${topic}这种事很正常…别太放在心上。你已经很棒了。`, direct:`${topic}别放在心上。你很棒。` },
        family: { formal:`${topic}这种事很常见，别太担心。你们已经做得很好了，一切都会好起来的。`, humorous:`${topic}这种事很常见！别太担心😂 你们已经做得很好了，一切都会好的！`, tactful:`${topic}这种事很常见…别太担心。你们已经做得很好了。`, direct:`${topic}别担心。你们做得很好。一切会好的。` },
        elder: { formal:`${topic}这种事很常见，您别太担心。您已经做得很好了，一切都会好起来的。`, humorous:`${topic}这种事很常见！您别太担心😂 您已经做得很好了，一切都会好的！`, tactful:`${topic}这种事很常见…您别太担心。您已经做得很好了。`, direct:`${topic}别担心。您做得很好。一切会好的。` },
        acquaintance: { formal:`${topic}这种事很常见，别太担心。一切都会好起来的。`, humorous:`${topic}这种事很常见！别太担心😂 一切都会好的！`, tactful:`${topic}这种事很常见…别太担心。一切都会好的。`, direct:`${topic}别担心。一切会好的。` },
      };
      const C = {
        colleague: { formal:`${topic}如果你需要休息一下，可以调休一天。工作上的事我帮你盯着，你放心。`, humorous:`${topic}要不要休息一天？工作的事我帮你盯着😂 你放心去调整，等你满血复活再回来！`, tactful:`${topic}如果需要休息一下…可以调休。工作上的事我帮你盯着，你放心。`, direct:`${topic}需要休息就调休。工作我帮你盯。` },
        boss: { formal:`领导，${topic}如果您需要休息调整，工作上的事我可以多分担一些。请您保重身体。`, humorous:`领导，${topic}如果需要休息就休息！工作的事我多分担点😂 您保重身体最重要！`, tactful:`领导，${topic}如果需要休息调整…工作上的事我可以多分担。请您保重身体。`, direct:`领导，${topic}需要休息就休息。工作我多分担。保重身体。` },
        client: { formal:`您好，${topic}的情况我们了解了。我们会加紧推进，尽量减少您的压力。请您放心。`, humorous:`您好，${topic}的情况我们了解了！我们会加紧推进😂 尽量减少您的压力，放心！`, tactful:`您好，${topic}的情况我们了解了…会加紧推进，减少您的压力。请放心。`, direct:`您好，${topic}了解。我们会加紧推进，减少您的压力。` },
        friend: { formal:`${topic}要不要出来走走？换换心情。我陪你，什么都不想，就走走。`, humorous:`${topic}出来走走？换换心情😂 我陪你，什么都不想，就走走！我请客！`, tactful:`${topic}要不要出来走走…换换心情？我陪你，什么都不想，就走走。`, direct:`${topic}出来走走？我陪你。` },
        date: { formal:`${topic}要不要出来散散心？我带你去个放松的地方，什么都不想，就待着。`, humorous:`${topic}出来散散心？我带你去个放松的地方😂 什么都不想，就待着！我请客！`, tactful:`${topic}要不要出来散散心…我带你去个放松的地方，什么都不想。`, direct:`${topic}出来散散心？我带你去。` },
        family: { formal:`${topic}别太操心了，该休息就休息。我们都在，有什么事一起扛。`, humorous:`${topic}别太操心了！该休息就休息😂 我们都在，有事一起扛！`, tactful:`${topic}别太操心了…该休息就休息。我们都在，有事一起扛。`, direct:`${topic}别操心。该休息就休息。有事一起扛。` },
        elder: { formal:`${topic}您别太操心了，该休息就休息。有事我来处理，您保重身体最重要。`, humorous:`${topic}您别太操心了！该休息就休息😂 有事我来处理，您保重身体最重要！`, tactful:`${topic}您别太操心了…该休息就休息。有事我来处理，您保重身体。`, direct:`${topic}您别操心。该休息就休息。有事我来处理。` },
        acquaintance: { formal:`${topic}别太担心，一切都会好起来的。有需要帮忙的可以找我。`, humorous:`${topic}别太担心！一切都会好的😂 有需要帮忙的找我！`, tactful:`${topic}别太担心…一切都会好的。有需要找我。`, direct:`${topic}别担心。一切会好的。有需要找我。` },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 同意 ----
    agreement(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: { formal:`好的，${topic}没问题。我这边开始准备，有进展随时同步。`, humorous:`收到！${topic}没问题😂 我这边马上搞起，有进展随时报告！`, tactful:`好的…${topic}没问题。我这边开始准备，有进展同步。`, direct:`${topic}没问题。开始准备。` },
        boss: { formal:`领导，${topic}收到。我会按要求推进，有进展及时向您汇报。`, humorous:`领导，${topic}收到！马上安排😂 有进展及时汇报！`, tactful:`领导，${topic}收到…我会按要求推进，有进展汇报。`, direct:`领导，${topic}收到。按要求推进，有进展汇报。` },
        client: { formal:`您好，${topic}确认收到。我们会按要求执行，有任何进展第一时间通知您。`, humorous:`您好！${topic}确认收到😂 马上安排执行，有进展第一时间通知您！`, tactful:`您好，${topic}确认收到…我们会按要求执行，有进展通知您。`, direct:`您好，${topic}确认收到。按要求执行，有进展通知。` },
        friend: { formal:`好的，${topic}没问题。到时候见！`, humorous:`好的！${topic}没问题😂 到时候见！`, tactful:`好的…${topic}没问题。到时候见！`, direct:`${topic}没问题。到时候见。` },
        date: { formal:`好的，${topic}没问题。期待！`, humorous:`好的！${topic}没问题😂 期待！`, tactful:`好的…${topic}没问题。期待！`, direct:`${topic}没问题。期待。` },
        family: { formal:`好的，${topic}没问题。我会安排好的。`, humorous:`好的！${topic}没问题😂 我会安排好的！`, tactful:`好的…${topic}没问题。我会安排好的。`, direct:`${topic}没问题。我会安排好。` },
        elder: { formal:`好的，${topic}没问题。您放心。`, humorous:`好的！${topic}没问题😂 您放心！`, tactful:`好的…${topic}没问题。您放心。`, direct:`${topic}没问题。您放心。` },
        acquaintance: { formal:`好的，${topic}没问题。`, humorous:`好的！${topic}没问题😂`, tactful:`好的…${topic}没问题。`, direct:`${topic}没问题。` },
      };
      const B = {
        colleague: { formal:`${topic}没问题，我这边马上安排。预计X日可以完成，到时候同步你。`, humorous:`${topic}没问题！马上安排😂 预计X日搞定，到时候通知你！`, tactful:`${topic}没问题…我这边马上安排。预计X日完成，到时候同步你。`, direct:`${topic}马上安排，预计X日完成。` },
        boss: { formal:`领导，${topic}收到，马上安排。预计X日完成，有进展及时汇报。`, humorous:`领导，${topic}收到！马上安排😂 预计X日搞定，有进展及时汇报！`, tactful:`领导，${topic}收到…马上安排。预计X日完成，有进展汇报。`, direct:`领导，${topic}马上安排，预计X日完成。` },
        client: { formal:`您好，${topic}确认收到，马上安排执行。预计X日完成，有进展第一时间通知您。`, humorous:`您好！${topic}确认收到😂 马上安排执行，预计X日完成！有进展第一时间通知您！`, tactful:`您好，${topic}确认收到…马上安排执行。预计X日完成，有进展通知您。`, direct:`您好，${topic}马上安排，预计X日完成。有进展通知。` },
        friend: { formal:`${topic}没问题！我到时候到。`, humorous:`${topic}没问题！我到时候到😂 不见不散！`, tactful:`${topic}没问题…我到时候到。`, direct:`${topic}没问题，到时候到。` },
        date: { formal:`${topic}没问题！我很期待。`, humorous:`${topic}没问题！我很期待😂`, tactful:`${topic}没问题…我很期待。`, direct:`${topic}没问题。期待。` },
        family: { formal:`${topic}没问题，我会安排好的。你们放心。`, humorous:`${topic}没问题！我会安排好的😂 你们放心！`, tactful:`${topic}没问题…我会安排好的。你们放心。`, direct:`${topic}没问题。放心。` },
        elder: { formal:`${topic}没问题，您放心。我会处理好的。`, humorous:`${topic}没问题！您放心😂 我会处理好的！`, tactful:`${topic}没问题…您放心。我会处理好的。`, direct:`${topic}没问题。放心。` },
        acquaintance: { formal:`${topic}没问题，到时候见。`, humorous:`${topic}没问题！到时候见😂`, tactful:`${topic}没问题…到时候见。`, direct:`${topic}没问题。到时候见。` },
      };
      const C = {
        colleague: { formal:`${topic}可以的。如果过程中有需要确认的地方，我会及时跟你沟通。`, humorous:`${topic}可以的！过程中有问题随时找你😂 咱保持沟通！`, tactful:`${topic}可以的…如果过程中有需要确认的，我会及时跟你沟通。`, direct:`${topic}可以。有问题及时沟通。` },
        boss: { formal:`领导，${topic}收到。执行过程中有关键节点会及时向您汇报，确保按质按量完成。`, humorous:`领导，${topic}收到！执行中有关键节点及时汇报😂 保证按质按量完成！`, tactful:`领导，${topic}收到…执行中有关键节点会及时汇报，确保按质按量完成。`, direct:`领导，${topic}收到。关键节点及时汇报，按质按量完成。` },
        client: { formal:`您好，${topic}确认收到。执行过程中有任何进展会第一时间通知您，确保让您满意。`, humorous:`您好！${topic}确认收到😂 执行中有进展第一时间通知您，保证让您满意！`, tactful:`您好，${topic}确认收到…执行中有进展会通知您，确保让您满意。`, direct:`您好，${topic}确认收到。有进展通知您，确保满意。` },
        friend: { formal:`${topic}可以的，到时候找你。`, humorous:`${topic}可以的！到时候找你😂`, tactful:`${topic}可以的…到时候找你。`, direct:`${topic}可以。到时候找你。` },
        date: { formal:`${topic}可以的，到时候见。`, humorous:`${topic}可以的！到时候见😂`, tactful:`${topic}可以的…到时候见。`, direct:`${topic}可以。到时候见。` },
        family: { formal:`${topic}可以的，我会处理好的。`, humorous:`${topic}可以的！我会处理好的😂`, tactful:`${topic}可以的…我会处理好的。`, direct:`${topic}可以。放心。` },
        elder: { formal:`${topic}可以的，您放心。`, humorous:`${topic}可以的！您放心😂`, tactful:`${topic}可以的…您放心。`, direct:`${topic}可以。放心。` },
        acquaintance: { formal:`${topic}可以的，到时候见。`, humorous:`${topic}可以的！到时候见😂`, tactful:`${topic}可以的…到时候见。`, direct:`${topic}可以。到时候见。` },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 协商 ----
    negotiation(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        colleague: { formal:`关于${topic}，我了解了一下情况。考虑到实际因素，你看这个方案是否可以接受：XX。如果有不同意见可以再商量。`, humorous:`关于${topic}，我打探了一下"行情"😂 考虑到各种因素，你看这个方案行不行：XX。不行咱再聊！`, tactful:`关于${topic}…我了解了一下情况。考虑到实际因素，你看这个方案可以接受吗：XX。`, direct:`${topic}，建议方案：XX。可以接受吗？` },
        boss: { formal:`领导，关于${topic}，我调研了一下市场情况，建议方案如下：XX。这样既能控制成本，又不影响质量。请您参考。`, humorous:`领导，关于${topic}，我调研了一下市场😂 建议方案：XX。既省钱又不掉链子，您参考参考！`, tactful:`领导，关于${topic}…我调研了一下市场情况，建议方案：XX。既能控制成本，又不影响质量。`, direct:`领导，${topic}建议方案：XX。控制成本，保证质量。请参考。` },
        client: { formal:`您好，关于${topic}，根据您的预算和需求，我们制定了以下方案：XX。这个方案在保证质量的前提下，已经是比较有竞争力的价格了。您看是否可以接受？`, humorous:`您好！关于${topic}，根据您的预算和需求，我们方案如下：😂 XX。这已经是"骨折价"了，保证质量的前提下最优惠！您看行吗？`, tactful:`您好，关于${topic}…根据您的预算和需求，方案如下：XX。保证质量的前提下，已经是比较优惠的价格了。`, direct:`您好，${topic}方案：XX。保证质量，价格已最优。可以接受吗？` },
        friend: { formal:`关于${topic}，我觉得可以这样：XX。你觉得呢？`, humorous:`关于${topic}，我觉得可以这样😂 XX。你觉得呢？不行再商量！`, tactful:`关于${topic}…我觉得可以这样：XX。你觉得呢？`, direct:`${topic}，建议：XX。你觉得呢？` },
        date: { formal:`关于${topic}，我们可以这样安排：XX。你觉得可以吗？`, humorous:`关于${topic}，我们可以这样安排😂 XX。你觉得行不？不行我换个方案！`, tactful:`关于${topic}…我们可以这样安排：XX。你觉得可以吗？`, direct:`${topic}，安排：XX。可以吗？` },
        family: { formal:`关于${topic}，我建议这样：XX。你们觉得怎么样？`, humorous:`关于${topic}，我建议这样😂 XX。你们觉得咋样？`, tactful:`关于${topic}…我建议这样：XX。你们觉得怎么样？`, direct:`${topic}，建议：XX。怎么样？` },
        elder: { formal:`关于${topic}，我建议这样安排：XX。您觉得可以吗？`, humorous:`关于${topic}，我建议这样😂 XX。您觉得行不？`, tactful:`关于${topic}…我建议这样安排：XX。您觉得可以吗？`, direct:`${topic}，建议：XX。可以吗？` },
        acquaintance: { formal:`关于${topic}，我了解了一下，建议方案：XX。你觉得呢？`, humorous:`关于${topic}，我了解了一下😂 建议方案：XX。你觉得呢？`, tactful:`关于${topic}…我了解了一下，建议方案：XX。你觉得呢？`, direct:`${topic}，建议：XX。你觉得呢？` },
      };
      const B = {
        colleague: { formal:`${topic}我理解你的诉求，不过考虑到实际情况，可能需要做一些调整。你看这样折中一下行吗：XX。`, humorous:`${topic}我理解你的诉求！不过实际情况嘛…咱折中一下？😂 XX这样行不？`, tactful:`${topic}我理解你的诉求…不过考虑到实际情况，可能需要调整。你看这样折中行吗：XX。`, direct:`${topic}需调整。折中方案：XX。行吗？` },
        boss: { formal:`领导，${topic}我理解预算有限。建议我们可以分阶段投入，先解决最核心的部分，后续根据效果再追加。这样风险更可控。`, humorous:`领导，${topic}我理解预算有限😂 建议分阶段投入：先搞核心部分，后续看效果再追加。这样风险小！`, tactful:`领导，${topic}我理解预算有限…建议分阶段投入，先解决核心部分，后续根据效果追加。`, direct:`领导，${topic}建议分阶段投入。先做核心，后续看效果追加。风险可控。` },
        client: { formal:`您好，${topic}我非常理解您的预算考虑。我们可以调整方案，在保证核心功能的前提下优化成本。调整后的方案如下：XX。您看是否可以接受？`, humorous:`您好！${topic}我非常理解您的预算考虑😂 我们可以调整方案，保证核心功能的前提下优化成本。调整后：XX。您看行吗？`, tactful:`您好，${topic}我理解您的预算考虑…我们可以调整方案，保证核心功能的前提下优化成本。调整后：XX。`, direct:`您好，${topic}可调整方案：保证核心功能，优化成本。XX方案。可以吗？` },
        friend: { formal:`${topic}我理解你的想法，不过这样可能更好：XX。你觉得呢？`, humorous:`${topic}我懂你的想法！不过这样可能更好😂 XX。你觉得呢？`, tactful:`${topic}我理解你的想法…不过这样可能更好：XX。你觉得呢？`, direct:`${topic}，更好的方案：XX。你觉得呢？` },
        date: { formal:`${topic}我理解你的想法，不过我们可以这样调整：XX。你觉得呢？`, humorous:`${topic}我懂你的想法！不过可以这样调整😂 XX。你觉得呢？`, tactful:`${topic}我理解你的想法…不过可以这样调整：XX。你觉得呢？`, direct:`${topic}，调整方案：XX。你觉得呢？` },
        family: { formal:`${topic}我理解你们的想法，不过我建议这样：XX。你们觉得呢？`, humorous:`${topic}我懂你们的想法！不过我建议这样😂 XX。你们觉得呢？`, tactful:`${topic}我理解你们的想法…不过我建议这样：XX。你们觉得呢？`, direct:`${topic}，建议：XX。你们觉得呢？` },
        elder: { formal:`${topic}我理解您的想法，不过建议这样安排：XX。您觉得可以吗？`, humorous:`${topic}我懂您的想法！不过建议这样😂 XX。您觉得行不？`, tactful:`${topic}我理解您的想法…不过建议这样安排：XX。您觉得可以吗？`, direct:`${topic}，建议：XX。可以吗？` },
        acquaintance: { formal:`${topic}我理解你的想法，不过建议这样：XX。你觉得呢？`, humorous:`${topic}我懂你的想法！不过建议这样😂 XX。你觉得呢？`, tactful:`${topic}我理解你的想法…不过建议这样：XX。你觉得呢？`, direct:`${topic}，建议：XX。你觉得呢？` },
      };
      const C = {
        colleague: { formal:`${topic}我们各自退一步，找一个双方都能接受的方案。你看XX这个方案怎么样？`, humorous:`${topic}咱各自退一步，找个双方都能接受的😂 XX这个方案怎么样？`, tactful:`${topic}我们各自退一步…找一个双方都能接受的方案。你看XX怎么样？`, direct:`${topic}各退一步。方案：XX。怎么样？` },
        boss: { formal:`领导，${topic}综合考虑成本和效果，建议折中方案：XX。这样既满足核心需求，又控制在合理预算内。`, humorous:`领导，${topic}综合考虑，建议折中方案：😂 XX。既满足核心需求，又控制预算！`, tactful:`领导，${topic}综合考虑成本和效果…建议折中方案：XX。既满足核心需求，又控制预算。`, direct:`领导，${topic}折中方案：XX。满足核心需求，控制预算。` },
        client: { formal:`您好，${topic}我们想找到一个双赢的方案。调整后的方案如下：XX。这是我们在保证质量的前提下能给出的最优价格。期待与您达成合作。`, humorous:`您好！${topic}咱找个双赢的方案😂 调整后：XX。保证质量的前提下最优价格了！期待合作！`, tactful:`您好，${topic}我们想找到双赢的方案…调整后：XX。保证质量的前提下最优价格。期待合作。`, direct:`您好，${topic}双赢方案：XX。保证质量，最优价格。期待合作。` },
        friend: { formal:`${topic}我们各退一步，找个都满意的方案。你看XX怎么样？`, humorous:`${topic}咱各退一步😂 找个都满意的！XX怎么样？`, tactful:`${topic}我们各退一步…找个都满意的方案。你看XX怎么样？`, direct:`${topic}各退一步。方案：XX。怎么样？` },
        date: { formal:`${topic}我们各退一步，找个都满意的方案。你看XX怎么样？`, humorous:`${topic}咱各退一步😂 找个都满意的！XX怎么样？`, tactful:`${topic}我们各退一步…找个都满意的方案。你看XX怎么样？`, direct:`${topic}各退一步。方案：XX。怎么样？` },
        family: { formal:`${topic}我们各退一步，找个都满意的方案。你们看XX怎么样？`, humorous:`${topic}咱各退一步😂 找个都满意的！XX怎么样？`, tactful:`${topic}我们各退一步…找个都满意的方案。你们看XX怎么样？`, direct:`${topic}各退一步。方案：XX。怎么样？` },
        elder: { formal:`${topic}我们各退一步，找个都满意的方案。您看XX怎么样？`, humorous:`${topic}咱各退一步😂 找个都满意的！XX怎么样？`, tactful:`${topic}我们各退一步…找个都满意的方案。您看XX怎么样？`, direct:`${topic}各退一步。方案：XX。怎么样？` },
        acquaintance: { formal:`${topic}我们各退一步，找个都满意的方案。你看XX怎么样？`, humorous:`${topic}咱各退一步😂 找个都满意的！XX怎么样？`, tactful:`${topic}我们各退一步…找个都满意的方案。你看XX怎么样？`, direct:`${topic}各退一步。方案：XX。怎么样？` },
      };
      return [pickByStyle(A,rel,sty), pickByStyle(B,rel,sty), pickByStyle(C,rel,sty)];
    },

    // ---- 表白 ----
    confession(ctx) {
      const { rel, sty, topic } = ctx;
      const A = {
        date: { formal:`认识你这段时间，我发现自己越来越喜欢跟你聊天。想认真地问你，愿意和我试试吗？`, humorous:`认识你这段时间，我发现自己越来越喜欢跟你聊天了😂 想认真问你个事——你愿意被我"独家签约"吗？`, tactful:`认识你这段时间…我发现自己越来越喜欢跟你聊天。想认真问你，愿意和我试试吗？`, direct:`我喜欢你，想和你在一起。你愿意吗？` },
        friend: { formal:`认识你这么久，我发现自己对你的感觉不只是朋友。想认真跟你说，我喜欢你。`, humorous:`认识你这么久，我发现我对你的感觉"超标"了😂 想认真跟你说——我喜欢你，不是朋友那种！`, tactful:`认识你这么久…我发现自己对你的感觉不只是朋友。想认真说，我喜欢你。`, direct:`我喜欢你，不是朋友那种。` },
        acquaintance: { formal:`虽然认识不久，但我对你很有好感。想进一步了解你，不知道你愿不愿意？`, humorous:`虽然认识不久，但我对你很有好感😂 想进一步了解你，不知道你愿不愿意给我个机会？`, tactful:`虽然认识不久…但我对你很有好感。想进一步了解你，不知道你愿不愿意？`, direct:`对你有好感，想进一步了解你。` },
      };
      const B = {
        date: { formal:`每次跟你聊天都很开心，期待每一次见面。我想说，你在我心里已经很重要了。如果你也有同样的感觉，我们可以认真试试。`, humorous:`每次跟你聊天都超开心，期待每一次见面😂 我想说，你在我心里已经"霸屏"了！如果你也有感觉，咱认真试试？`, tactful:`每次跟你聊天都很开心…期待每一次见面。你在我心里已经很重要了。如果你也有同样的感觉…`, direct:`你在我心里很重要。如果你也有感觉，我们试试。` },
        friend: { formal:`其实一直没说，跟你在一起的时候我特别开心。我对你不只是朋友的感觉，想认真跟你在一起。`, humorous:`其实一直没说，跟你在一起的时候我特别开心😂 我对你的感觉已经"越界"了，想认真跟你在一起！`, tactful:`其实一直没说…跟你在一起的时候我特别开心。我对你不只是朋友的感觉。`, direct:`跟你在一起很开心。我对你不只是朋友的感觉。` },
        acquaintance: { formal:`每次见到你都会心情变好，想更多地了解你。如果你不介意的话，我们可以从更深入的交流开始？`, humorous:`每次见到你心情都会变好😂 想更多地了解你！如果不介意，咱从更深入的交流开始？`, tactful:`每次见到你都会心情变好…想更多地了解你。如果不介意，我们可以从更深入的交流开始？`, direct:`见到你就开心。想更深入了解你。` },
      };
      const C = {
        date: { formal:`我想了很久，还是想跟你说。从第一次见面到现在，你一直在我心里。我希望能有机会认真对你好，你愿意给我这个机会吗？`, humorous:`我想了很久，还是得说！从第一次见面到现在，你一直在我心里"住着"😂 我希望能认真对你好，给我个机会呗？`, tactful:`我想了很久…还是想跟你说。从第一次见面到现在，你一直在我心里。我希望能有机会认真对你好。`, direct:`你一直在我心里。想认真对你好。给我个机会？` },
        friend: { formal:`想了很久，还是想跟你说。其实我对你一直都是特别的感觉，不是普通的友情。如果你愿意，我想认真追你。`, humorous:`想了很久还是得说！其实我对你的感觉一直是"特别版"😂 不是普通友情那种！如果你愿意，我想认真追你！`, tactful:`想了很久…还是想跟你说。其实我对你一直是特别的感觉，不是普通的友情。如果你愿意…`, direct:`对你一直是特别的感觉。如果你愿意，我想认真追你。` },
        acquaintance: { formal:`想了很久，还是想让你知道。我对你很有好感，希望能有机会进一步发展。你怎么想？`, humorous:`想了很久还是想让你知道！我对你很有好感😂 希望能有机会进一步发展！你怎么想？`, tactful:`想了很久…还是想让你知道。我对你很有好感，希望能进一步发展。你怎么想？`, direct:`对你有好感。想进一步发展。你怎么想？` },
      };
      const fb = `${fillOpener('date',sty,topic)}我想跟你说，你在我心里很特别。`;
      return [pickByStyleSafe(A,rel,sty,fb), pickByStyleSafe(B,rel,sty,fb), pickByStyleSafe(C,rel,sty,fb)];
    },
  };

  // ========== 通用兜底 ==========
  function generalFallback(ctx) {
    const { rel, sty, topic, purpose } = ctx;
    const op = fillOpener(rel, sty, topic);
    // opener 已包含 topic，body 不再重复
    const A = `${op}我这边想了一下，初步的想法是——可以按这个方向来推进。你看方便的话我们再细聊？`;
    const B = `${op}关于这件事，我的建议是先理清核心诉求，然后分步骤处理。你觉得这样可行吗？`;
    const C = `${op}我理解你的意思，具体来说我们可以这样安排：1. 先确认关键信息 2. 制定方案 3. 执行跟进。你看行吗？`;
    return [A, B, C];
  }

  // ========== 对外 API ==========
  /**
   * @param {Object} input
   * @param {string} input.chatContext  最近几条聊天记录
   * @param {string} input.purpose      聊天目的
   * @param {string} input.relationship 关系标签 key
   * @param {string} input.style        风格 key
   * @returns {{ scenario:string, sentiment:string, results:string[], tips:string[] }}
   */
  function generate(input) {
    const chatContext = (input.chatContext || '').trim();
    const purpose     = (input.purpose || '').trim();
    const rel         = input.relationship || 'colleague';
    const sty         = input.style || 'formal';

    const topic      = extractTopic(purpose);
    const scenario   = detectScenario(purpose);
    const sentiment  = analyzeSentiment(chatContext);
    const ctx        = { rel, sty, topic, purpose, chatContext, sentiment };

    let results;
    const fn = STRATEGIES[scenario];
    if (fn) {
      results = fn(ctx);
    } else {
      results = generalFallback(ctx);
    }

    // 生成小贴士
    const tips = [];
    if (sentiment === 'negative') tips.push('⚠️ 对方情绪偏负面，建议先共情再表达观点。');
    if (scenario === 'decline')   tips.push('💡 拒绝时建议给出替代方案，降低对方失落感。');
    if (scenario === 'apology')   tips.push('💡 道歉时建议主动提出改进措施，显示诚意。');
    if (rel === 'boss')           tips.push('💡 跟领导沟通建议结论先行，简明扼要。');
    if (rel === 'client')         tips.push('💡 跟客户沟通建议以解决问题为导向，保持积极。');
    if (rel === 'date')           tips.push('💡 跟暧昧对象聊天建议保持轻松，别给太大压力。');
    if (chatContext && chatContext.length > 50) tips.push('💡 已参考聊天上下文，回复更贴合语境。');
    if (tips.length === 0) tips.push('💡 已根据关系和风格生成回复，可根据实际情况微调。');

    return { scenario, sentiment, results, tips, topic };
  }

  return { generate, RELATIONSHIPS, STYLES, SCENARIO_KEYWORDS };
})();
