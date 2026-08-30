
$imported = {} if $imported.nil?
$imported["Dai-WorldMap"] = true

#===============================================================================
# [CONFIG START] LET THE CONFIGURATION BEGIN!
#===============================================================================
module DAI
  module WORLDMAP
    #---------------------------------------------------------------------------

    #---------------------------------------------------------------------------
    CURSOR_IMAGE = 'Quill_New'
    CURSOR_ORIGIN = [1,120]
    CURSOR_SPEED = 5
    CURSOR_MARGIN = 10
    #---------------------------------------------------------------------------

    #---------------------------------------------------------------------------
    LOCDISP_ENABLED = true
    LOCDISP_OFFSET = [0,12]
    #---------------------------------------------------------------------------

    #---------------------------------------------------------------------------
    GOTOLOC_TEXT = 'Chuyển đến %s?'
    GOTOLOC_YES = 'Vâng'
    GOTOLOC_NO = 'Không'
    #---------------------------------------------------------------------------

    #---------------------------------------------------------------------------
    FT_ENABLED = true
    FT_LABEL = 'Fast Travel'
    FT_LABEL_ALIGNMENT = 1
    FT_OPTIONS_ALIGNMENT = 1
    #---------------------------------------------------------------------------

    #---------------------------------------------------------------------------
    BGM_ENABLED = false
    BGM_PROPERTIES = ['Theme5',100,70]
    #---------------------------------------------------------------------------

    #---------------------------------------------------------------------------
    MAP_DEFAULT_X = Graphics.width / 2
    MAP_DEFAULT_Y = Graphics.height / 2
    MAP_IMAGE = 'mapmoi'
    MAP_SCROLL_SPEED = 10
    #---------------------------------------------------------------------------
    MAP_POINTS = [] # Do not delete!
   
  
#===============================================================================
# [CONFIG END]
#-------------------------------------------------------------------------------
# [WARNING]
# Do NOT, and I repeat, do NOT edit anything below this part unless you know
# what you're doing. I won't be responsible if your computer blows up just
# because you tinkered with some code and made impossibly fatal errors.
#===============================================================================
  end
end

module Sound
  def self.play_bgm_worldmap
    props = DAI::WORLDMAP::BGM_PROPERTIES
    Audio.bgm_play('Audio/BGM/' + props[0],props[1],props[2])
  end
end

class Game_Temp
  
  attr_reader :iwm_location
  
  alias_method :dni_iwm_init, :initialize
  
  def initialize
    dni_iwm_init
    @iwm_location = ''
  end
  
  def set_iwm_location(locname)
    @iwm_location = locname
  end
  
  def get_iwm_location
    @iwm_location
  end
  
end

class Game_Party
  
  attr_accessor :locations
  
  alias_method :dni_iwm_init, :initialize
  def initialize
    dni_iwm_init
    @locations = Hash.new
    for loc in DAI::WORLDMAP::MAP_POINTS
      @locations[loc[:name]] = true if loc[:default] == true
    end
  end
  
end

class Game_Interpreter
  
  def fadeout_all(time = 1000)
    RPG::BGM.fade(time)
    RPG::BGS.fade(time)
    RPG::ME.fade(time)
    Graphics.fadeout(time * Graphics.frame_rate / 1000)
    RPG::BGM.stop
    RPG::BGS.stop
    RPG::ME.stop
  end
  
  def call_worldmap(locname='')
    $game_temp.set_iwm_location(locname)
    fadeout_all
    SceneManager.call(Scene_WorldMap)
  end
  
  def unlock_location(locname,enabled=true)
    for loc in DAI::WORLDMAP::MAP_POINTS
      if loc[:name] == locname
        $game_party.locations[locname] = enabled
        return
      end
    end
  end
  
  def enable_location(locname)
    if $game_party.locations.keys.include?(locname)
      $game_party.locations[locname] = true
      
    end
  end
  
  def disable_location(locname)
    if $game_party.locations.keys.include?(locname)
      $game_party.locations[locname] = false
    end
  end
  
  def location_unlocked?(locname)
    $game_party.locations.keys.include?(locname)
  end
  
  def location_enabled?(locname)
    if $game_party.locations.keys.include?(locname)
      $game_party.locations[locname]
    end
    false
  end
  
end

class Window_WorldMapFTLabel < Window_Base
  def initialize
    x = Graphics.width - 200
    y = 0
    width = 200
    height = fitting_height(1)
    super(x,y,width,height)
    self.openness = 0
    refresh
  end
  
  def alignment
    DAI::WORLDMAP::FT_LABEL_ALIGNMENT
  end
  
  def refresh
    contents.clear
    draw_text(0,0,contents.width,line_height,DAI::WORLDMAP::FT_LABEL,alignment)
  end
  
end

class Window_WorldMapFTCmd < Window_Command
  
  def initialize(x,y)
    super
    deactivate
    self.openness = 0
  end
  
  def window_width
    200
  end
  
  def alignment
    DAI::WORLDMAP::FT_OPTIONS_ALIGNMENT
  end
  
  def window_height
    Graphics.height - fitting_height(1)
  end
  
  def make_command_list
    for location in $game_party.locations.keys.sort
      add_command(location,nil)
    end
  end
  
end


class Window_WorldMapConfirmCmd < Window_HorzCommand
  
  def initialize
    x = (Graphics.width - window_width)/2
    y = (Graphics.height - window_height)/2 + fitting_height(1)/2
    super(x,y)
    deactivate
    self.openness = 0
  end
  
  def window_width
     return Graphics.width * 2 / 3
  end
  
  def col_max
    return 2
  end
  
  def make_command_list
    add_command(DAI::WORLDMAP::GOTOLOC_YES,:enter)
    add_command(DAI::WORLDMAP::GOTOLOC_NO,:exit)
  end
  
end

class Window_WorldMapConfirmMsg < Window_Base
  
  def initialize
    width = Graphics.width * 2 / 3
    height = fitting_height(1)
    x = (Graphics.width - width) / 2
    y = (Graphics.height - height) / 2 - fitting_height(1)/2
    super(x,y,width,height)
    self.openness = 0
  end
  
  def open(locname='')
    super()
    @locname = locname
    refresh
  end
  
  def refresh
    contents.clear
    text = sprintf(DAI::WORLDMAP::GOTOLOC_TEXT,@locname)
    draw_text(0,0,contents.width,line_height,text,1)
  end
  
end

class Scene_WorldMap < Scene_Base
    
  def draw_icon(icon_index, x, y, enabled=true)
    sprite = Sprite.new
    sprite.bitmap = Bitmap.new(24,24)
    bitmap = Cache.system("Iconset")
    rect = Rect.new(icon_index % 16 * 24, icon_index / 16 * 24, 24, 24)
    sprite.bitmap.blt(0, 0, bitmap, rect, enabled ? 255 : 160)
    sprite.ox = 11
    sprite.oy = 11
    sprite.x = x
    sprite.y = y
    sprite.viewport = @map_viewport
    return sprite
  end
  
  def start
    super
    Sound.play_bgm_worldmap if DAI::WORLDMAP::BGM_ENABLED
    @mode = 'map'
    make_map
    make_locations
    make_locdisp
    make_cursor
    make_confirm_windows
    make_ft_windows
    loc = get_location_item($game_temp.get_iwm_location)
    cursor_to_location(loc) if loc != nil
  end
  
  def update
    super
    bool1 = Input.dir8 != 0 && @mode == 'map'
    bool2 = get_cursor_hor_edge != 0 || get_cursor_ver_edge != 0
    update_input
    update_map if bool2
    update_cursor if bool1
    update_locdisp if bool1 || bool2
  end
  
  def terminate
    super
    @locdisp.dispose
  end
  
  def get_location_item(locname)
    for location in DAI::WORLDMAP::MAP_POINTS
      return location if location[:name] == locname
    end
    return nil
  end
  
  def cursor_to_location(loc)
    new_ox = loc[:map_x] - Graphics.width / 2
    new_oy = loc[:map_y] - Graphics.height / 2
    @map_viewport.ox = [[0,new_ox].max,@map.width - Graphics.width].min
    @map_viewport.oy = [[0,new_oy].max,@map.height - Graphics.height].min
    @cursor.x = loc[:map_x] - @map_viewport.ox
    @cursor.y = loc[:map_y] - @map_viewport.oy
    update_locdisp
  end
  
  def update_map_ft
    loc = get_location_item(@window_ftcmd.current_data[:name])
    cursor_to_location(loc)
  end
    
  alias_method :dni_iwm_return_scene, :return_scene
  def return_scene
    fadeout_all
    dni_iwm_return_scene
    $game_map.autoplay
  end
  
  def update_input
    if @mode == 'map'
      return_scene if Input.trigger?(:B)
      confirm_location if Input.trigger?(:C)
      ft_mode if Input.trigger?(:A) && DAI::WORLDMAP::FT_ENABLED
    elsif @mode == 'ft' && (Input.trigger?(:DOWN) || Input.trigger?(:UP))
      update_map_ft
    end
  end
  
  def ft_mode
    @mode = 'ft'
    @window_ftlab.open
    @window_ftcmd.open
    @window_ftcmd.activate
    update_map_ft
  end
  
  def confirm_location
    if @locname != ''
      if $game_party.locations[@locname] == true
        Sound.play_ok
        @mode = 'confirm'
        @window_confmsg.open(@locname)
        @window_confcmd.open
        @window_confcmd.activate
      else
        Sound.play_buzzer
      end
    end
  end
  
  def update_locdisp
    @locdisp.bitmap.clear
    for location in @map_locations.keys
      orig_x = @map_locations[location].x - @map_viewport.ox
      orig_y = @map_locations[location].y - @map_viewport.oy
      bool1 = (@cursor.x - orig_x).abs <= 12
      bool2 = (@cursor.y - orig_y).abs <= 12
      if bool1 && bool2
        @locname = location
        @locdisp.bitmap.draw_text(0,0,@locdisp.width,24,location,1)
        @locdisp.x = @cursor.x + DAI::WORLDMAP::LOCDISP_OFFSET[0]
        @locdisp.y = @cursor.y + DAI::WORLDMAP::LOCDISP_OFFSET[1]
        return
      end
    end
    @locname = ''
  end
  
  def on_confirmcmd_ok
    loc = get_location_item(@locname)
    $game_player.reserve_transfer(loc[:transfer_mapid], loc[:transfer_x],
    loc[:transfer_y], loc[:transfer_f])
    $game_player.perform_transfer
    return_scene
  end
  
  def on_confirmcmd_cancel
    @window_confmsg.close
    @window_confcmd.close
    @window_confcmd.deactivate
    @mode = 'map'
  end
  
  def on_ftcmd_exit
    @window_ftlab.close
    @window_ftcmd.close
    @window_ftcmd.deactivate
    @mode = 'map'
  end
  
  def update_cursor
    if Input.dir8 != 0
      case Input.dir8
      when 1,4,7
        @cursor.x -= DAI::WORLDMAP::CURSOR_SPEED
      when 3,6,9
        @cursor.x += DAI::WORLDMAP::CURSOR_SPEED
      end
      case Input.dir8
      when 7,8,9
        @cursor.y -= DAI::WORLDMAP::CURSOR_SPEED
      when 1,2,3
        @cursor.y += DAI::WORLDMAP::CURSOR_SPEED
      end
    end
    margin = DAI::WORLDMAP::CURSOR_MARGIN
    @cursor.x = [[margin,@cursor.x].max,Graphics.width - margin].min
    @cursor.y = [[margin,@cursor.y].max,Graphics.height - margin].min
  end
  
  def update_map
    scroll_spd = DAI::WORLDMAP::MAP_SCROLL_SPEED
    case get_cursor_hor_edge
    when -1
      @map_viewport.ox -= scroll_spd
    when 1
      @map_viewport.ox += scroll_spd
    end
    @map_viewport.ox = [[0,@map_viewport.ox].max,@map.width - Graphics.width].min
    case get_cursor_ver_edge
    when -1
      @map_viewport.oy -= scroll_spd
    when 1
      @map_viewport.oy += scroll_spd
    end
    @map_viewport.oy = [[0,@map_viewport.oy].max,@map.height - Graphics.height].min
  end
  
  def get_cursor_hor_edge
    margin = DAI::WORLDMAP::CURSOR_MARGIN
    return -1 if @cursor.x == margin
    return 1 if @cursor.x == Graphics.width - margin
    return 0
  end
  
  def get_cursor_ver_edge
    margin = DAI::WORLDMAP::CURSOR_MARGIN
    return -1 if @cursor.y == margin
    return 1 if @cursor.y == Graphics.height - margin
    return 0
  end
  
  def make_ft_windows
    @window_ftlab = Window_WorldMapFTLabel.new
    x = Graphics.width - 200
    y = @window_ftlab.height
    @window_ftcmd = Window_WorldMapFTCmd.new(x,y)
    @window_ftcmd.set_handler(:ok, method(:on_ftcmd_exit))
    @window_ftcmd.set_handler(:cancel, method(:on_ftcmd_exit))
  end
  
  def make_confirm_windows
    @window_confmsg = Window_WorldMapConfirmMsg.new
    @window_confcmd = Window_WorldMapConfirmCmd.new
    @window_confcmd.set_handler(:enter, method(:on_confirmcmd_ok))
    @window_confcmd.set_handler(:cancel, method(:on_confirmcmd_cancel))
    @window_confcmd.set_handler(:exit, method(:on_confirmcmd_cancel))
  end
  
  def make_locdisp
    @locname = ''
    @locdisp = Sprite.new
    @locdisp.bitmap = Bitmap.new(Graphics.width,24)
    @locdisp.ox = Graphics.width / 2
    @locdisp.oy = 11
    @locdisp.viewport = @interface_viewport
  end
  
  def make_map
    @map = Sprite.new
    @map.bitmap = Cache.picture(DAI::WORLDMAP::MAP_IMAGE)
    @map_viewport = Viewport.new(@map.src_rect)
    @map.viewport = @map_viewport
    @map.z = -2
  end
  
  def make_locations
    @map_locations = Hash.new
    for locname in $game_party.locations.keys
      enabled = $game_party.locations[locname]
      location = get_location_item(locname)
      index = location[:map_icon_index]
      sprite = draw_icon(index,location[:map_x],location[:map_y],enabled)
      @map_locations[location[:name]] = sprite
    end
  end
  
  def make_cursor
    @cursor = Sprite.new
    @cursor.bitmap = Cache.picture(DAI::WORLDMAP::CURSOR_IMAGE)
    @cursor.blend_type = 1
    @cursor.ox = DAI::WORLDMAP::CURSOR_ORIGIN[0]
    @cursor.oy = DAI::WORLDMAP::CURSOR_ORIGIN[1]
    @cursor.x = Graphics.width / 2
    @cursor.y = Graphics.height / 2
    @cursor.z = 0
    @interface_viewport = Viewport.new(0,0,Graphics.width, Graphics.height)
    @cursor.viewport = @interface_viewport
  end
  
end