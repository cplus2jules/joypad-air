using System.Reflection;
using System.Text.Json;
using System.Numerics;
using Ryujinx.Common.Configuration.Hid;
using Ryujinx.Common.Configuration.Hid.Keyboard;
using Ryujinx.Common.Configuration.Hid.Controller.Motion;
using Ryujinx.Common.Utilities;
using Ryujinx.Input;
using Ryujinx.Input.HLE;
using Client = Ryujinx.Input.Motion.CemuHook.Client;
using KeyboardModel = Ryujinx.Ava.UI.Models.Input.KeyboardInputConfig;

static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine("PASS " + label); }
var options = JsonHelper.GetDefaultSerializerOptions();
var profile = (StandardKeyboardInputConfig)JsonSerializer.Deserialize<InputConfig>(File.ReadAllText(args[0]), options)!;
Check(profile.Motion is CemuHookMotionConfigController { EnableMotion: true, Slot: 0 }, "keyboard motion deserializes through real Ryujinx converter");
var saved = new KeyboardModel(profile).GetConfig();
var roundTrip = (StandardKeyboardInputConfig)JsonSerializer.Deserialize<InputConfig>(JsonSerializer.Serialize(saved, options), options)!;
Check(roundTrip.Motion is CemuHookMotionConfigController { EnableMotion: true, Slot: 0 }, "settings UI round-trip preserves keyboard motion");
var driver = new EmptyDriver();
var manager = new NpadManager(driver,driver,driver);
typeof(NpadManager).GetField("_inputConfig", BindingFlags.Instance|BindingFlags.NonPublic)!.SetValue(manager, new List<InputConfig>{profile});
using var client = new Client(manager);
var controller = new NpadController(client);
controller.UpdateUserConfiguration(profile);
client.HandleResponse(File.ReadAllBytes(args[1]),0);
client.HandleResponse(File.ReadAllBytes(args[2]),0);
Check(client.TryGetData(0,0,out var motion), "CemuHook accepts keyboard-backed motion");
Check(Vector3.Distance(motion.Accelerometer,new Vector3(0.25f,-0.75f,-0.5f)) < 0.0001f, "Npad acceleration matches phone device frame");
Check(Vector3.Distance(motion.Gyroscrope,new Vector3(90,-30,60)) < 0.0001f, "gyro sign convention matches pinned consumer");
client.HandleResponse(File.ReadAllBytes(args[1]),0);
Check(motion.TimeStamp == 1016666, "older UDP sample does not roll back sensor time");
typeof(NpadController).GetField("_leftMotionInput",BindingFlags.Instance|BindingFlags.NonPublic)!.SetValue(controller,motion);
var state = controller.GetHLEMotionState();
Check(state.Gyroscope.Length()>0 && state.Accelerometer.Length()>0,"single right Joy-Con supplies six-axis state");
for(int i=0;i<120;i++) controller.UpdateUserConfiguration(roundTrip);
Check(client.TryGetData(0,0,out _),"unchanged per-frame configuration retains motion");
((CemuHookMotionConfigController)roundTrip.Motion).DsuServerPort++;
controller.UpdateUserConfiguration(roundTrip);
Check(!client.TryGetData(0,0,out _),"in-place endpoint edit clears cached motion");
roundTrip.Motion.EnableMotion=false;
controller.UpdateUserConfiguration(roundTrip);
Check(controller.GetHLEMotionState().Gyroscope==Vector3.Zero,"motion disable clears six-axis input");
roundTrip.Motion=null;
controller.UpdateUserConfiguration(roundTrip);
Check(controller.GetHLEMotionState().Gyroscope==Vector3.Zero,"motion removal remains safe");
Console.WriteLine("Emulator motion contract passed. Physical game scoring remains untested.");
class EmptyDriver : IGamepadDriver {
 public string DriverName=>"Test"; public ReadOnlySpan<string> GamepadsIds=>Array.Empty<string>();
 public event Action<string> OnGamepadConnected {add{} remove{}} public event Action<string> OnGamepadDisconnected {add{} remove{}}
 public IGamepad GetGamepad(string id)=>null; public IEnumerable<IGamepad> GetGamepads()=>Array.Empty<IGamepad>(); public void Dispose(){}
}
