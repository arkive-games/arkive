from pbz.wiki.text import rich


def test_style_tags_map_to_the_site_vocabulary():
    assert rich("可<Character_Yellow_Decorator2>化解</>敌人") == "可<hl>化解</hl>敌人"
    assert rich("增加<WeaponDes_Num_Green>1</>次") == "增加<up>1</up>次"
    assert rich("<Bold>注意</>") == "<b>注意</b>"
    assert rich("<CharacterButton_Red>危险</>") == "<warn>危险</warn>"


def test_button_prompts_keep_only_their_action_id():
    text = '按<InputAction id="HeavyAttack" height="26" RightPadding="5" LeftPadding="5"/>蓄力'
    assert rich(text) == '按<key id="HeavyAttack"/>蓄力'
    assert rich('<UIRowName id="RightTrigger" height="24"/>') == '<key id="RightTrigger"/>'


def test_tuning_numbers_are_substituted():
    assert rich('持续<dtv id="X021"/>秒', {"X021": "40"}) == "持续<up>40</up>秒"
    # An unknown parameter drops out rather than leaking the tag.
    assert rich('持续<dtv id="X999"/>秒', {"X021": "40"}) == "持续秒"


def test_inline_icons_only_when_served():
    text = 'Consumes <WeaponDes_Num_Green>1</><img id="SpiritShadow" />to'
    assert rich(text, icons={"SpiritShadow"}) == 'Consumes <up>1</up><icon id="SpiritShadow"/>to'
    assert rich(text, icons=set()) == "Consumes <up>1</up>to"
    # The animated flame is Pure Sha-Chi, served under the game's static icon for it.
    assert rich('1<Niagara id="Fire"/>to', icons={"jingchunFire"}) == '1<icon id="jingchunFire"/>to'


def test_unknown_tags_drop_but_keep_their_text():
    assert rich("<LetterBold>信</>") == "<b>信</b>"
    assert rich("<right>落款</>") == "落款"


def test_unclosed_tags_are_closed():
    assert rich("<Character_Yellow_Decorator2>未闭合") == "<hl>未闭合</hl>"


def test_runtime_arguments_become_a_placeholder():
    assert rich("每级可增加{0}的攻击力") == "每级可增加X的攻击力"


def test_empty_and_line_endings():
    assert rich(None) == ""
    assert rich("一\r\n二 ") == "一\n二"
