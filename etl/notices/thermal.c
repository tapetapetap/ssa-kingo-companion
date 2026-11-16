#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
typedef struct __IOHIDEvent *IOHIDEventRef;
typedef struct __IOHIDServiceClient *IOHIDServiceClientRef;
typedef struct __IOHIDEventSystemClient *IOHIDEventSystemClientRef;
extern IOHIDEventSystemClientRef IOHIDEventSystemClientCreate(CFAllocatorRef);
extern int IOHIDEventSystemClientSetMatching(IOHIDEventSystemClientRef, CFDictionaryRef);
extern CFArrayRef IOHIDEventSystemClientCopyServices(IOHIDEventSystemClientRef);
extern IOHIDEventRef IOHIDServiceClientCopyEvent(IOHIDServiceClientRef, int64_t, int32_t, int64_t);
extern CFStringRef IOHIDServiceClientCopyProperty(IOHIDServiceClientRef, CFStringRef);
extern double IOHIDEventGetFloatValue(IOHIDEventRef, int32_t);
int main(void) {
  int page = 0xff00, usage = 5; // Apple 벤더 페이지, 온도 센서
  const void *keys[] = { CFSTR("PrimaryUsagePage"), CFSTR("PrimaryUsage") };
  const void *vals[] = { CFNumberCreate(NULL, kCFNumberIntType, &page), CFNumberCreate(NULL, kCFNumberIntType, &usage) };
  CFDictionaryRef match = CFDictionaryCreate(NULL, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  IOHIDEventSystemClientRef sys = IOHIDEventSystemClientCreate(kCFAllocatorDefault);
  IOHIDEventSystemClientSetMatching(sys, match);
  CFArrayRef services = IOHIDEventSystemClientCopyServices(sys);
  if (!services || CFArrayGetCount(services) == 0) return 1;
  for (CFIndex i = 0; i < CFArrayGetCount(services); i++) {
    IOHIDServiceClientRef s = (IOHIDServiceClientRef)CFArrayGetValueAtIndex(services, i);
    CFStringRef name = IOHIDServiceClientCopyProperty(s, CFSTR("Product"));
    IOHIDEventRef e = IOHIDServiceClientCopyEvent(s, 15, 0, 0); // 온도 이벤트
    if (!name || !e) continue;
    char buf[128];
    CFStringGetCString(name, buf, sizeof buf, kCFStringEncodingUTF8);
    printf("%s\t%.1f\n", buf, IOHIDEventGetFloatValue(e, 15 << 16));
  }
  return 0;
}
