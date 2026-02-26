import com.graphhopper.util.JsonFeature;
import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.util.Arrays;

public class Inspector {
    public static void main(String[] args) {
        System.out.println("Methods of JsonFeature:");
        for (Method m : JsonFeature.class.getMethods()) {
            System.out.println(m.getName() + " -> " + Arrays.toString(m.getParameterTypes()));
        }
        System.out.println("\nFields of JsonFeature:");
        for (Field f : JsonFeature.class.getDeclaredFields()) {
            System.out.println(f.getName() + " (" + f.getType().getName() + ")");
        }
    }
}
